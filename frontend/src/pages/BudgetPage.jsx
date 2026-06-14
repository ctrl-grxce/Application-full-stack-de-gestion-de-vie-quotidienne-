import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Wallet, Sparkles, Send, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import api, { API, euro, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CHART_COLORS = ["#D17A58", "#4A7A59", "#3A6B8A", "#C9A23F", "#8A5FA8", "#B85C5C", "#6B7280"];
const incomeCats = ["Salaire", "Freelance", "Investissement", "Cadeau", "Autre"];
const expenseCats = ["Logement", "Alimentation", "Transport", "Loisirs", "Santé", "Abonnements", "Shopping", "Factures", "Autre"];
const fmtMonth = (m) => {
  const [y, mo] = m.split("-");
  return new Date(y, mo - 1).toLocaleDateString("fr-FR", { month: "short" });
};

const suggestions = [
  "Comment puis-je économiser davantage ?",
  "Analyse mes dépenses du mois.",
  "Quelle est ma tendance financière ?",
];

export default function BudgetPage() {
  const [summary, setSummary] = useState(null);
  const [txs, setTxs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "expense", amount: "", category: "Alimentation", description: "", date: new Date().toISOString().slice(0, 10) });

  const load = () => {
    api.get("/budget/summary").then((r) => setSummary(r.data)).catch(() => {});
    api.get("/transactions").then((r) => setTxs(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Montant invalide");
    try {
      await api.post("/transactions", { ...form, amount: Number(form.amount) });
      setOpen(false);
      setForm({ type: "expense", amount: "", category: "Alimentation", description: "", date: new Date().toISOString().slice(0, 10) });
      load(); toast.success("Transaction ajoutée");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async (id) => {
    setTxs((prev) => prev.filter((t) => t.id !== id));
    await api.delete(`/transactions/${id}`).catch(() => {});
    load();
  };

  const cats = form.type === "income" ? incomeCats : expenseCats;

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 md:py-12 animate-fade-up">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Budget</h1>
          <p className="text-muted-foreground mt-1">Gérez vos finances avec un assistant IA.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-transaction-button"><Plus className="h-4 w-4" /> Transaction</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouvelle transaction</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setForm({ ...form, type: "expense", category: expenseCats[0] })}
                  data-testid="type-expense"
                  className={cn("py-2.5 rounded-md border text-sm font-medium transition-colors", form.type === "expense" ? "border-danger bg-danger/10 text-danger" : "border-border text-muted-foreground")}>
                  Dépense
                </button>
                <button onClick={() => setForm({ ...form, type: "income", category: incomeCats[0] })}
                  data-testid="type-income"
                  className={cn("py-2.5 rounded-md border text-sm font-medium transition-colors", form.type === "income" ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground")}>
                  Revenu
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Montant (€)</Label>
                  <Input type="number" step="0.01" data-testid="tx-amount-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" data-testid="tx-date-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="tx-category-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input data-testid="tx-desc-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optionnel" />
              </div>
            </div>
            <DialogFooter><Button onClick={save} data-testid="save-transaction-button">Ajouter</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Wallet className="h-4 w-4" /> Solde</div>
          <p className={cn("mt-2 text-3xl font-display font-bold tracking-tight", summary && summary.balance < 0 ? "text-danger" : "")}>{summary ? euro(summary.balance) : "—"}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><TrendingUp className="h-4 w-4 text-success" /> Revenus</div>
          <p className="mt-2 text-3xl font-display font-bold tracking-tight text-success">{summary ? euro(summary.total_income) : "—"}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><TrendingDown className="h-4 w-4 text-danger" /> Dépenses</div>
          <p className="mt-2 text-3xl font-display font-bold tracking-tight text-danger">{summary ? euro(summary.total_expense) : "—"}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Charts */}
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-lg p-5">
              <h3 className="font-display font-semibold mb-4">Évolution mensuelle</h3>
              {summary?.trend?.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={summary.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(v) => euro(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="income" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expense" fill="hsl(var(--danger))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <h3 className="font-display font-semibold mb-4">Dépenses par catégorie</h3>
              {summary?.categories?.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={summary.categories} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {summary.categories.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => euro(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </div>
          </div>

          {/* Transactions */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="font-display font-semibold mb-4">Transactions récentes</h3>
            {txs.length ? (
              <ul className="divide-y divide-border">
                {txs.slice(0, 12).map((t) => (
                  <li key={t.id} className="group flex items-center gap-3 py-3" data-testid={`tx-${t.id}`}>
                    <div className={cn("h-9 w-9 rounded-md flex items-center justify-center shrink-0", t.type === "income" ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                      {t.type === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t.category}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.description || new Date(t.date).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <span className={cn("text-sm font-medium", t.type === "income" ? "text-success" : "text-danger")}>
                      {t.type === "income" ? "+" : "−"}{euro(t.amount)}
                    </span>
                    <button onClick={() => remove(t.id)} data-testid={`delete-tx-${t.id}`} className="text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground py-8 text-center">Aucune transaction. Ajoutez-en une pour commencer.</p>}
          </div>
        </div>

        {/* AI panel */}
        <AIPanel />
      </div>
    </div>
  );
}

function Empty() {
  return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Pas encore de données</div>;
}

function AIPanel() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    api.get("/budget/ai-history").then((r) => setMessages(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || streaming) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const resp = await fetch(`${API}/budget/ai-chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!resp.ok || !resp.body) throw new Error("stream");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + chunk };
          return copy;
        });
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "Désolé, une erreur est survenue. Réessayez." };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg flex flex-col h-[640px]">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-md bg-ai/15 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-ai" />
        </div>
        <div>
          <p className="font-display font-semibold text-sm">Conseiller IA</p>
          <p className="text-xs text-muted-foreground">Propulsé par Claude</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="ai-messages">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <div className="h-12 w-12 rounded-xl bg-ai-surface mx-auto flex items-center justify-center mb-3">
              <Sparkles className="h-6 w-6 text-ai" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">Posez une question sur vos finances pour obtenir des conseils personnalisés.</p>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} data-testid="ai-suggestion"
                  className="w-full text-left text-sm px-3 py-2 rounded-md bg-secondary/60 hover:bg-secondary transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-ai-surface text-foreground")}>
              {m.content || (streaming && i === messages.length - 1 ? <span className="inline-flex gap-1"><Dot /><Dot d={0.2} /><Dot d={0.4} /></span> : "")}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2">
          <Input
            data-testid="ai-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Demandez un conseil…"
            disabled={streaming}
          />
          <Button size="icon" onClick={() => send()} disabled={streaming || !input.trim()} data-testid="ai-send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Dot({ d = 0 }) {
  return <span className="h-1.5 w-1.5 rounded-full bg-ai animate-bounce" style={{ animationDelay: `${d}s` }} />;
}
