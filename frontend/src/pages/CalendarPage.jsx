import { useEffect, useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks,
  format, isSameDay, isSameMonth, parseISO, differenceInMinutes,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const HOUR_H = 52;
const COLORS = ["#D17A58", "#4A7A59", "#3A6B8A", "#C9A23F", "#8A5FA8", "#B85C5C"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const toLocalISO = (date, time) => `${date}T${time}:00`;

export default function CalendarPage() {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    title: "", description: "", date: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00", endTime: "10:00", color: COLORS[0], all_day: false,
  });

  const load = () => api.get("/events").then((r) => setEvents(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const openCreate = (date, hour) => {
    setEditing(null);
    const d = date ? format(date, "yyyy-MM-dd") : format(cursor, "yyyy-MM-dd");
    const sh = hour != null ? String(hour).padStart(2, "0") : "09";
    const eh = hour != null ? String(Math.min(hour + 1, 23)).padStart(2, "0") : "10";
    setForm({ title: "", description: "", date: d, startTime: `${sh}:00`, endTime: `${eh}:00`, color: COLORS[0], all_day: false });
    setOpen(true);
  };

  const openEdit = (ev) => {
    const s = parseISO(ev.start), e = parseISO(ev.end);
    setEditing(ev.id);
    setForm({
      title: ev.title, description: ev.description || "", date: format(s, "yyyy-MM-dd"),
      startTime: format(s, "HH:mm"), endTime: format(e, "HH:mm"), color: ev.color, all_day: ev.all_day,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Le titre est requis");
    const payload = {
      title: form.title, description: form.description, color: form.color, all_day: form.all_day,
      start: toLocalISO(form.date, form.all_day ? "00:00" : form.startTime),
      end: toLocalISO(form.date, form.all_day ? "23:59" : form.endTime),
    };
    try {
      if (editing) await api.put(`/events/${editing}`, payload);
      else await api.post("/events", payload);
      setOpen(false); load();
      toast.success(editing ? "Événement mis à jour" : "Événement créé");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async () => {
    if (!editing) return;
    await api.delete(`/events/${editing}`).catch(() => {});
    setOpen(false); load();
  };

  const title = useMemo(() => {
    if (view === "month") return format(cursor, "MMMM yyyy", { locale: fr });
    if (view === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 1 });
      const e = endOfWeek(cursor, { weekStartsOn: 1 });
      return `${format(s, "d MMM", { locale: fr })} – ${format(e, "d MMM yyyy", { locale: fr })}`;
    }
    return format(cursor, "EEEE d MMMM yyyy", { locale: fr });
  }, [view, cursor]);

  const nav = (dir) => {
    if (view === "month") setCursor((c) => addMonths(c, dir));
    else if (view === "week") setCursor((c) => addWeeks(c, dir));
    else setCursor((c) => addDays(c, dir));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 md:px-10 pt-8 pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight capitalize">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-secondary rounded-md p-0.5">
            {["month", "week", "day"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                data-testid={`view-${v}`}
                className={cn("px-3 py-1.5 text-sm rounded-[5px] transition-colors capitalize",
                  view === v ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {v === "month" ? "Mois" : v === "week" ? "Semaine" : "Jour"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => nav(-1)} data-testid="cal-prev"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())} data-testid="cal-today">Aujourd'hui</Button>
          <Button variant="outline" size="icon" onClick={() => nav(1)} data-testid="cal-next"><ChevronRight className="h-4 w-4" /></Button>
          <Button onClick={() => openCreate()} data-testid="add-event-button"><Plus className="h-4 w-4" /> Événement</Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 md:px-10 pb-8">
        {view === "month" && <MonthView cursor={cursor} events={events} onDay={openCreate} onEvent={openEdit} />}
        {view === "week" && <TimeGrid days={weekDays(cursor)} events={events} onSlot={openCreate} onEvent={openEdit} />}
        {view === "day" && <TimeGrid days={[cursor]} events={events} onSlot={openCreate} onEvent={openEdit} single />}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Modifier l'événement" : "Nouvel événement"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Titre</Label>
              <Input data-testid="event-title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Réunion, rendez-vous…" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea data-testid="event-desc-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" data-testid="event-date-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Début</Label>
                <Input type="time" data-testid="event-start-input" disabled={form.all_day} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fin</Label>
                <Input type="time" data-testid="event-end-input" disabled={form.all_day} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    className={cn("h-6 w-6 rounded-full transition-transform", form.color === c && "ring-2 ring-offset-2 ring-offset-card ring-foreground scale-110")}
                    style={{ background: c }} />
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.all_day} onChange={(e) => setForm({ ...form, all_day: e.target.checked })} />
                Journée entière
              </label>
            </div>
          </div>
          <DialogFooter className="flex sm:justify-between">
            {editing ? (
              <Button variant="outline" onClick={remove} data-testid="delete-event-button" className="text-danger"><Trash2 className="h-4 w-4" /> Supprimer</Button>
            ) : <span />}
            <Button onClick={save} data-testid="save-event-button">{editing ? "Enregistrer" : "Créer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function weekDays(cursor) {
  const s = startOfWeek(cursor, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

function MonthView({ cursor, events, onDay, onEvent }) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const weekDayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="h-full flex flex-col border border-border rounded-lg overflow-hidden bg-card">
      <div className="grid grid-cols-7 border-b border-border">
        {weekDayLabels.map((d) => (
          <div key={d} className="py-2 text-center text-xs uppercase tracking-wider text-muted-foreground font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(parseISO(e.start), day));
          const today = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              onClick={() => onDay(day)}
              data-testid={`day-cell-${format(day, "yyyy-MM-dd")}`}
              className={cn("min-h-[96px] border-b border-r border-border p-1.5 cursor-pointer hover:bg-secondary/40 transition-colors",
                !isSameMonth(day, cursor) && "bg-secondary/20")}
            >
              <div className={cn("text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full mb-1",
                today ? "bg-primary text-primary-foreground" : !isSameMonth(day, cursor) ? "text-muted-foreground" : "")}>
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <div key={e.id} onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}
                    className="text-[11px] px-1.5 py-0.5 rounded truncate text-white font-medium" style={{ background: e.color }}>
                    {!e.all_day && format(parseISO(e.start), "HH:mm") + " "}{e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({ days, events, onSlot, onEvent, single }) {
  return (
    <div className="h-full flex flex-col border border-border rounded-lg overflow-hidden bg-card">
      <div className={cn("grid border-b border-border", single ? "grid-cols-[56px_1fr]" : "grid-cols-[56px_repeat(7,1fr)]")}>
        <div />
        {days.map((d) => {
          const today = isSameDay(d, new Date());
          return (
            <div key={d.toISOString()} className="py-2 text-center border-l border-border">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{format(d, "EEE", { locale: fr })}</p>
              <p className={cn("text-lg font-display font-semibold mt-0.5 h-8 w-8 mx-auto flex items-center justify-center rounded-full",
                today && "bg-primary text-primary-foreground")}>{format(d, "d")}</p>
            </div>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className={cn("grid relative", single ? "grid-cols-[56px_1fr]" : "grid-cols-[56px_repeat(7,1fr)]")}>
          {/* hour labels */}
          <div className="col-start-1">
            {HOURS.map((h) => (
              <div key={h} className="text-[11px] text-muted-foreground text-right pr-2 relative" style={{ height: HOUR_H }}>
                <span className="absolute -top-1.5 right-2">{h > 0 ? `${String(h).padStart(2, "0")}:00` : ""}</span>
              </div>
            ))}
          </div>
          {/* day columns */}
          {days.map((day) => {
            const dayEvents = events.filter((e) => !e.all_day && isSameDay(parseISO(e.start), day));
            return (
              <div key={day.toISOString()} className="relative border-l border-border">
                {HOURS.map((h) => (
                  <div key={h} onClick={() => onSlot(day, h)} className="border-b border-border/60 hover:bg-secondary/40 cursor-pointer transition-colors" style={{ height: HOUR_H }} />
                ))}
                {dayEvents.map((e) => {
                  const s = parseISO(e.start), en = parseISO(e.end);
                  const top = (s.getHours() * 60 + s.getMinutes()) / 60 * HOUR_H;
                  const height = Math.max(differenceInMinutes(en, s) / 60 * HOUR_H, 22);
                  return (
                    <div key={e.id} onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}
                      className="absolute left-1 right-1 rounded-md px-2 py-1 text-white overflow-hidden cursor-pointer shadow-sm"
                      style={{ top, height, background: e.color }}>
                      <p className="text-[11px] font-semibold leading-tight truncate">{e.title}</p>
                      <p className="text-[10px] opacity-90">{format(s, "HH:mm")} – {format(en, "HH:mm")}</p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
