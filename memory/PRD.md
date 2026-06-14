# LifeOS — PRD

## Problem Statement (original, FR)
Web app type Notion mais plus intuitive pour l'organisation. 3 fonctionnalités principales :
1. Organisation (calendrier multi-vues avec heures, tâches à faire)
2. Suivi & tracking de projets
3. Budget (revenus, dépenses, solde, comptabilité) avec une IA qui prédit et conseille.
Design smooth & épuré type Notion / Anthropic.

## User Choices
- Auth: email/password (JWT) + Google (Emergent managed)
- AI: Claude Sonnet 4.6 (Emergent LLM key)
- Devise: Euro (€)
- Thème: clair & épuré + switch clair/sombre
- Priorité: les 3 fonctionnalités au même niveau

## Architecture
- Backend: FastAPI + MongoDB (motor). Cookie auth (access_token JWT / session_token Google).
- Frontend: React 19, React Router, Tailwind (Manrope/Figtree fonts), shadcn/ui, recharts, date-fns.
- AI: emergentintegrations LlmChat streaming (anthropic claude-sonnet-4-6), endpoint /api/budget/ai-chat.

## Implemented (2026-06-14)
- Auth: register/login/logout/me + Google OAuth callback. Demo seed demo@lifeos.app/demo1234.
- Dashboard: greeting, stat cards, today tasks, finances mini, upcoming events.
- Calendar: month/week/day views with hourly time-grid, create/edit/delete events, colors, all-day.
- Tasks: 3-column board (todo/in_progress/done), priority, due date, toggle done, CRUD.
- Projects: project grid with progress, Kanban board (todo/in_progress/review/done), card CRUD + move.
- Budget: income/expense transactions CRUD, summary (balance/income/expense), monthly bar chart, category pie chart, AI advisor panel (streaming, French).
- Theme: light/dark toggle persisted in localStorage.

## Personas
- Particulier organisé voulant centraliser agenda, projets et finances dans un espace calme.

## Backlog
- P1: Drag & drop natif pour Kanban et tâches; récurrence d'événements; rappels/notifications.
- P1: Édition d'événements all-day multi-jours; vue agenda/liste.
- P2: Catégories budget personnalisables; export CSV; objectifs d'épargne; budgets mensuels par catégorie.
- P2: Sous-tâches, étiquettes, recherche globale (command palette).
- P2: a11y — ajouter DialogDescription aux modales.

## Next Tasks
- Drag & drop Kanban/tasks, recurring events, savings goals + AI monthly forecast.
