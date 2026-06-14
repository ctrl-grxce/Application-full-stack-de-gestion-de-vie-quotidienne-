import { useEffect, useState } from "react";
import { Plus, Trash2, Flag, Calendar as CalIcon } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const priorityColor = { high: "text-danger", medium: "text-chart-4", low: "text-success" };
const priorityLabel = { high: "Haute", medium: "Moyenne", low: "Basse" };
const columns = [
  { key: "todo", label: "À faire" },
  { key: "in_progress", label: "En cours" },
  { key: "done", label: "Terminé" },
];

const empty = { title: "", notes: "", status: "todo", priority: "medium", due_date: "", tags: [] };

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/tasks").then((r) => setTasks(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title.trim()) return toast.error("Le titre est requis");
    const payload = { ...form, due_date: form.due_date || null };
    try {
      if (editing) await api.put(`/tasks/${editing}`, payload);
      else await api.post("/tasks", payload);
      setOpen(false); setForm(empty); setEditing(null);
      load();
      toast.success(editing ? "Tâche mise à jour" : "Tâche créée");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const toggleDone = async (t) => {
    const next = { ...t, status: t.status === "done" ? "todo" : "done" };
    setTasks((prev) => prev.map((x) => (x.id === t.id ? next : x)));
    await api.put(`/tasks/${t.id}`, {
      title: next.title, notes: next.notes, status: next.status,
      priority: next.priority, due_date: next.due_date, tags: next.tags || [],
    }).catch(load);
  };

  const remove = async (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await api.delete(`/tasks/${id}`).catch(load);
  };

  const openEdit = (t) => {
    setEditing(t.id);
    setForm({ ...t, due_date: t.due_date || "", notes: t.notes || "" });
    setOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-12 animate-fade-up">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Tâches</h1>
          <p className="text-muted-foreground mt-1">Organisez vos to-do par statut.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(empty); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button data-testid="add-task-button"><Plus className="h-4 w-4" /> Nouvelle tâche</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Titre</Label>
                <Input data-testid="task-title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Que faut-il faire ?" />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea data-testid="task-notes-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Détails…" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger data-testid="task-status-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{columns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priorité</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger data-testid="task-priority-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Haute</SelectItem>
                      <SelectItem value="medium">Moyenne</SelectItem>
                      <SelectItem value="low">Basse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Échéance</Label>
                  <Input type="date" data-testid="task-due-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={save} data-testid="save-task-button">{editing ? "Enregistrer" : "Créer"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {columns.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="bg-secondary/40 border border-border rounded-lg p-4" data-testid={`column-${col.key}`}>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-sm font-semibold">{col.label}</h2>
                <span className="text-xs text-muted-foreground bg-card border border-border rounded-full px-2 py-0.5">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <div key={t.id} className="group bg-card border border-border rounded-md p-3 hover:shadow-sm transition-all" data-testid={`task-${t.id}`}>
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        checked={t.status === "done"}
                        onCheckedChange={() => toggleDone(t)}
                        data-testid={`toggle-task-${t.id}`}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(t)}>
                        <p className={cn("text-sm font-medium leading-snug", t.status === "done" && "line-through text-muted-foreground")}>{t.title}</p>
                        {t.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.notes}</p>}
                        <div className="flex items-center gap-3 mt-2">
                          <span className={cn("flex items-center gap-1 text-xs", priorityColor[t.priority])}>
                            <Flag className="h-3 w-3" /> {priorityLabel[t.priority]}
                          </span>
                          {t.due_date && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalIcon className="h-3 w-3" /> {new Date(t.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => remove(t.id)} data-testid={`delete-task-${t.id}`} className="text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Vide</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
