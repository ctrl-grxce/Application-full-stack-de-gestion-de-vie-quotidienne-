import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronLeft, MoreVertical, Flag, CalendarClock, ListChecks, GripVertical } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLORS = ["#4A7A59", "#D17A58", "#3A6B8A", "#C9A23F", "#8A5FA8", "#B85C5C"];
const boardCols = [
  { key: "todo", label: "À faire" },
  { key: "in_progress", label: "En cours" },
  { key: "review", label: "Révision" },
  { key: "done", label: "Terminé" },
];
const priorityColor = { high: "text-danger", medium: "text-chart-4", low: "text-success" };

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [active, setActive] = useState(null);

  const load = () => api.get("/projects").then((r) => setProjects(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  if (active) {
    return <ProjectBoard project={active} onBack={() => { setActive(null); load(); }} />;
  }
  return <ProjectGrid projects={projects} reload={load} onOpen={setActive} />;
}

function ProjectGrid({ projects, reload, onOpen }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0], status: "active", due_date: "" });

  const save = async () => {
    if (!form.name.trim()) return toast.error("Le nom est requis");
    try {
      await api.post("/projects", { ...form, due_date: form.due_date || null });
      setOpen(false); setForm({ name: "", description: "", color: COLORS[0], status: "active", due_date: "" });
      reload(); toast.success("Projet créé");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/projects/${id}`).catch(() => {});
    reload();
  };

  const statusLabel = { active: "Actif", on_hold: "En pause", completed: "Terminé" };

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-12 animate-fade-up">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Projets</h1>
          <p className="text-muted-foreground mt-1">Pilotez vos projets avec des tableaux Kanban.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-project-button"><Plus className="h-4 w-4" /> Nouveau projet</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouveau projet</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nom</Label>
                <Input data-testid="project-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom du projet" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea data-testid="project-desc-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger data-testid="project-status-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Actif</SelectItem>
                      <SelectItem value="on_hold">En pause</SelectItem>
                      <SelectItem value="completed">Terminé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date limite</Label>
                  <Input type="date" data-testid="project-due-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Couleur</Label>
                <div className="flex items-center gap-2 h-9">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setForm({ ...form, color: c })}
                      className={cn("h-6 w-6 rounded-full", form.color === c && "ring-2 ring-offset-2 ring-offset-card ring-foreground")} style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={save} data-testid="save-project-button">Créer</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-20 text-center">
          <p className="text-muted-foreground">Aucun projet pour l'instant. Créez-en un pour commencer.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
            return (
              <div key={p.id} onClick={() => onOpen(p)} data-testid={`project-${p.id}`}
                className="group bg-card border border-border rounded-lg p-5 cursor-pointer hover:shadow-sm transition-all">
                <div className="flex items-start justify-between">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                  <button onClick={(e) => remove(p.id, e)} data-testid={`delete-project-${p.id}`}
                    className="text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="font-display text-lg font-semibold mt-3">{p.name}</h3>
                {p.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>{statusLabel[p.status]}</span>
                    <span>{p.done_count}/{p.task_count} tâches</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  {p.due_date && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" /> Échéance {new Date(p.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectBoard({ project, onBack }) {
  const [tasks, setTasks] = useState([]);
  const [open, setOpen] = useState(false);
  const [col, setCol] = useState("todo");
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "" });
  const [dragId, setDragId] = useState(null);
  const [dragCol, setDragCol] = useState(null);
  const [detail, setDetail] = useState(null);
  const [subInput, setSubInput] = useState("");

  const load = () => api.get(`/projects/${project.id}/tasks`).then((r) => setTasks(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.title.trim()) return toast.error("Titre requis");
    try {
      await api.post(`/projects/${project.id}/tasks`, { ...form, status: col, due_date: form.due_date || null, subtasks: [] });
      setOpen(false); setForm({ title: "", description: "", priority: "medium", due_date: "" });
      load(); toast.success("Tâche ajoutée");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const persist = async (task) => {
    await api.put(`/project-tasks/${task.id}`, {
      title: task.title, description: task.description || "", status: task.status,
      priority: task.priority, due_date: task.due_date || null, subtasks: task.subtasks || [],
    }).catch(load);
  };

  const move = (task, status) => {
    if (task.status === status) return;
    const next = { ...task, status };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? next : t)));
    persist(next);
  };

  const remove = async (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setDetail(null);
    await api.delete(`/project-tasks/${id}`).catch(load);
  };

  const onDrop = (status) => {
    setDragCol(null);
    const task = tasks.find((t) => t.id === dragId);
    if (task) move(task, status);
    setDragId(null);
  };

  // subtasks within the detail dialog
  const updateDetail = (next) => {
    setDetail(next);
    setTasks((prev) => prev.map((t) => (t.id === next.id ? next : t)));
    persist(next);
  };
  const addSub = () => {
    if (!subInput.trim()) return;
    const next = { ...detail, subtasks: [...(detail.subtasks || []), { id: Math.random().toString(36).slice(2), title: subInput.trim(), done: false }] };
    setSubInput("");
    updateDetail(next);
  };
  const toggleSub = (sid) => {
    const next = { ...detail, subtasks: (detail.subtasks || []).map((s) => (s.id === sid ? { ...s, done: !s.done } : s)) };
    updateDetail(next);
  };
  const removeSub = (sid) => {
    const next = { ...detail, subtasks: (detail.subtasks || []).filter((s) => s.id !== sid) };
    updateDetail(next);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 md:px-10 pt-8 pb-4">
        <button onClick={onBack} data-testid="back-to-projects" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ChevronLeft className="h-4 w-4" /> Projets
        </button>
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full" style={{ background: project.color }} />
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{project.name}</h1>
          {project.due_date && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary border border-border rounded-full px-2.5 py-1">
              <CalendarClock className="h-3 w-3" /> {new Date(project.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
        {project.description && <p className="text-muted-foreground mt-1">{project.description}</p>}
        <p className="text-xs text-muted-foreground mt-2">Glissez-déposez les cartes entre les colonnes pour les déplacer.</p>
      </div>

      <div className="flex-1 overflow-x-auto px-6 md:px-10 pb-8">
        <div className="flex gap-4 h-full min-w-max">
          {boardCols.map((c) => {
            const items = tasks.filter((t) => t.status === c.key);
            return (
              <div
                key={c.key}
                onDragOver={(e) => { e.preventDefault(); setDragCol(c.key); }}
                onDragLeave={() => setDragCol((p) => (p === c.key ? null : p))}
                onDrop={() => onDrop(c.key)}
                className={cn("w-72 shrink-0 bg-secondary/40 border rounded-lg p-3 flex flex-col transition-colors",
                  dragCol === c.key ? "border-ai bg-ai/5" : "border-border")}
                data-testid={`board-col-${c.key}`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-sm font-semibold">{c.label} <span className="text-muted-foreground font-normal">{items.length}</span></h2>
                  <button onClick={() => { setCol(c.key); setOpen(true); }} data-testid={`add-card-${c.key}`} className="text-muted-foreground hover:text-foreground">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2 overflow-y-auto flex-1">
                  {items.map((t) => {
                    const subs = t.subtasks || [];
                    const doneSubs = subs.filter((s) => s.done).length;
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => { setDragId(null); setDragCol(null); }}
                        onClick={() => setDetail(t)}
                        className={cn("group bg-card border border-border rounded-md p-3 cursor-pointer hover:shadow-sm transition-all",
                          dragId === t.id && "opacity-50")}
                        data-testid={`card-${t.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                            <p className="text-sm font-medium leading-snug">{t.title}</p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger data-testid={`card-menu-${t.id}`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100">
                              <MoreVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              {boardCols.filter((x) => x.key !== t.status).map((x) => (
                                <DropdownMenuItem key={x.key} onClick={() => move(t, x.key)}>Déplacer → {x.label}</DropdownMenuItem>
                              ))}
                              <DropdownMenuItem className="text-danger" onClick={() => remove(t.id)}>Supprimer</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className={cn("flex items-center gap-1 text-xs", priorityColor[t.priority])}><Flag className="h-3 w-3" /></span>
                          {subs.length > 0 && (
                            <span className={cn("flex items-center gap-1 text-xs", doneSubs === subs.length ? "text-success" : "text-muted-foreground")}>
                              <ListChecks className="h-3 w-3" /> {doneSubs}/{subs.length}
                            </span>
                          )}
                          {t.due_date && <span className="text-xs text-muted-foreground">{new Date(t.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{detail?.title}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}
              <div className="flex items-center gap-2 text-xs">
                <span className={cn("flex items-center gap-1", priorityColor[detail.priority])}><Flag className="h-3 w-3" /> {detail.priority === "high" ? "Haute" : detail.priority === "medium" ? "Moyenne" : "Basse"}</span>
                {detail.due_date && <span className="text-muted-foreground">· {new Date(detail.due_date).toLocaleDateString("fr-FR")}</span>}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-1.5"><ListChecks className="h-4 w-4" /> Sous-tâches</Label>
                  {(detail.subtasks || []).length > 0 && (
                    <span className="text-xs text-muted-foreground">{(detail.subtasks || []).filter((s) => s.done).length}/{(detail.subtasks || []).length}</span>
                  )}
                </div>
                {(detail.subtasks || []).length > 0 && (
                  <Progress value={Math.round(((detail.subtasks || []).filter((s) => s.done).length / (detail.subtasks || []).length) * 100)} className="h-1.5 mb-3" />
                )}
                <ul className="space-y-1.5 mb-3">
                  {(detail.subtasks || []).map((s) => (
                    <li key={s.id} className="group flex items-center gap-2.5 py-1" data-testid={`subtask-${s.id}`}>
                      <Checkbox checked={s.done} onCheckedChange={() => toggleSub(s.id)} data-testid={`toggle-subtask-${s.id}`} />
                      <span className={cn("text-sm flex-1", s.done && "line-through text-muted-foreground")}>{s.title}</span>
                      <button onClick={() => removeSub(s.id)} className="text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2">
                  <Input value={subInput} data-testid="subtask-input" onChange={(e) => setSubInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} placeholder="Ajouter une sous-tâche…" />
                  <Button size="icon" variant="outline" onClick={addSub} data-testid="add-subtask-button"><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex sm:justify-between">
            <Button variant="outline" className="text-danger" onClick={() => remove(detail.id)} data-testid="delete-card-button"><Trash2 className="h-4 w-4" /> Supprimer</Button>
            <Button onClick={() => setDetail(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle tâche</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Titre</Label>
              <Input data-testid="card-title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea data-testid="card-desc-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priorité</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger data-testid="card-priority-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="low">Basse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Échéance</Label>
                <Input type="date" data-testid="card-due-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={add} data-testid="save-card-button">Ajouter</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
