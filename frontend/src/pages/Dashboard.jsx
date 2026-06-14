import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Calendar, KanbanSquare, Wallet, TrendingUp, TrendingDown, ArrowRight, Sparkles } from "lucide-react";
import api, { euro } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function StatCard({ icon: Icon, label, value, sub, to, accent }) {
  return (
    <Link
      to={to}
      data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}
      className="group bg-card border border-border rounded-lg p-5 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between">
        <div className={`h-9 w-9 rounded-md flex items-center justify-center ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-4 text-2xl font-display font-bold tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-12 animate-fade-up">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
          {greet}, {user?.name?.split(" ")[0] || "vous"}.
        </h1>
        <p className="text-muted-foreground mt-2">Voici un aperçu de votre journée.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={CheckCircle2}
          label="Tâches"
          value={data ? `${data.tasks_done}/${data.tasks_total}` : "—"}
          sub="terminées"
          to="/tasks"
          accent="bg-ai/15 text-ai"
        />
        <StatCard
          icon={KanbanSquare}
          label="Projets actifs"
          value={data ? data.projects_active : "—"}
          sub={data ? `${data.projects_total} au total` : ""}
          to="/projects"
          accent="bg-chart-3/15 text-chart-3"
        />
        <StatCard
          icon={Calendar}
          label="Événements"
          value={data ? data.upcoming_events.length : "—"}
          sub="à venir"
          to="/calendar"
          accent="bg-chart-4/20 text-chart-4"
        />
        <StatCard
          icon={Wallet}
          label="Solde"
          value={data ? euro(data.balance) : "—"}
          sub="actuel"
          to="/budget"
          accent="bg-success/15 text-success"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today tasks */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold">À faire aujourd'hui</h2>
            <Link to="/tasks" className="text-sm text-ai hover:underline">Tout voir</Link>
          </div>
          {data?.tasks_today?.length ? (
            <ul className="space-y-2">
              {data.tasks_today.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 px-3 rounded-md bg-secondary/50">
                  <span className={`h-2 w-2 rounded-full ${t.priority === "high" ? "bg-danger" : t.priority === "medium" ? "bg-chart-4" : "bg-success"}`} />
                  <span className="text-sm">{t.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucune tâche pour aujourd'hui. 🌿</p>
          )}
        </div>

        {/* Finance mini */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Finances</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-md bg-success/10">
              <span className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-success" /> Revenus</span>
              <span className="font-medium text-success">{data ? euro(data.total_income) : "—"}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md bg-danger/10">
              <span className="flex items-center gap-2 text-sm"><TrendingDown className="h-4 w-4 text-danger" /> Dépenses</span>
              <span className="font-medium text-danger">{data ? euro(data.total_expense) : "—"}</span>
            </div>
          </div>
          <Link to="/budget" className="mt-4 flex items-center gap-2 text-sm text-ai hover:underline">
            <Sparkles className="h-4 w-4" /> Conseils IA budget
          </Link>
        </div>
      </div>

      {/* Upcoming events */}
      <div className="mt-6 bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">Prochains événements</h2>
          <Link to="/calendar" className="text-sm text-ai hover:underline">Calendrier</Link>
        </div>
        {data?.upcoming_events?.length ? (
          <ul className="divide-y divide-border">
            {data.upcoming_events.map((e) => (
              <li key={e.id} className="flex items-center gap-4 py-3">
                <span className="h-9 w-1 rounded-full" style={{ background: e.color }} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(e.start)}{!e.all_day && ` · ${fmtTime(e.start)}`}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">Rien de prévu. Profitez du calme.</p>
        )}
      </div>
    </div>
  );
}
