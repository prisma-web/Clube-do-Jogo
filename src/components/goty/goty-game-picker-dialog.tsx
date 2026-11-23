'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Check, LoaderCircle, Search, Sparkles, Star } from 'lucide-react';
import { GOTY_2026_CURATED_CATALOG, type GotyPersonalCategory, type GotySearchGameResult } from '@clube-do-jogo/domain';
import { apiFetch } from '@/lib/api-client';
import { demoGames } from '@/lib/demo-data';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { GotyPosterArt } from './goty-poster-art';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

function searchDemoCatalog(query: string, includeAllYears: boolean): GotySearchGameResult[] {
  const needle = normalize(query);
  const pool: GotySearchGameResult[] = [
    ...GOTY_2026_CURATED_CATALOG,
    ...(includeAllYears
      ? demoGames.map(game => ({
          ...game,
          release_eligibility: game.release_year === 2026 ? ('commercial_2026' as const) : ('manual_override' as const),
          effective_release_year: game.release_year ?? null,
          effective_release_date: game.release_year ? `${game.release_year}` : null,
          eligibility_label: game.release_year === 2026 ? 'Lançamento 2026' : `Lançado em ${game.release_year || '—'}`,
          is_eligible_2026: game.release_year === 2026,
        }))
      : []),
  ];

  if (!needle) return pool.slice(0, 18);
  return pool
    .filter(game =>
      normalize(game.title).includes(needle)
      || (game.genres || []).some(genre => normalize(genre).includes(needle))
      || (game.platforms || []).some(platform => normalize(platform).includes(needle)),
    )
    .slice(0, 18);
}

export function GotyGamePickerDialog({
  open,
  onOpenChange,
  category,
  selectedTitle,
  isDemo,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: GotyPersonalCategory | null;
  selectedTitle?: string | null;
  isDemo: boolean;
  onSelect: (game: GotySearchGameResult) => Promise<void> | void;
}) {
  const [draftQuery, setDraftQuery] = useState('');
  const [includeAllYears, setIncludeAllYears] = useState(false);
  const [remoteResults, setRemoteResults] = useState<GotySearchGameResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(draftQuery.trim(), 260);

  const demoResults = useMemo(
    () => (isDemo && open ? searchDemoCatalog(debouncedQuery, includeAllYears) : []),
    [debouncedQuery, includeAllYears, isDemo, open],
  );

  const results = isDemo ? demoResults : remoteResults;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setDraftQuery('');
      setIncludeAllYears(false);
      setError(null);
      setLoading(false);
    }
    onOpenChange(nextOpen);
  }

  useEffect(() => {
    if (!open || isDemo) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          includeAllYears: String(includeAllYears),
          limit: '18',
        });
        const response = await apiFetch(`/api/goty/search-games?${params}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Não foi possível buscar jogos de 2026.');
        if (!cancelled) {
          setRemoteResults(Array.isArray(payload.items) ? (payload.items as GotySearchGameResult[]) : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao consultar catálogo de jogos.');
          setRemoteResults(searchDemoCatalog(debouncedQuery, includeAllYears));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, includeAllYears, isDemo, open]);

  const subtitle = useMemo(() => {
    if (!category) return undefined;
    return category.description;
  }, [category]);

  async function handleChoose(game: GotySearchGameResult) {
    setSavingId(game.id);
    try {
      await onSelect(game);
      handleOpenChange(false);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={category ? `Escolher jogo · ${category.name}` : 'Escolher jogo de 2026'}
        description={subtitle}
        className="goty-dialog max-w-2xl border-[#dfc06c]/25 bg-[#0b0a0f] text-[#f9f4e4]"
      >
        <div className="flex max-h-[calc(min(88dvh,760px)-88px)] flex-col">
          <div className="space-y-3 border-b border-[#dfc06c]/15 px-5 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#b8a574]" />
              <input
                autoFocus
                value={draftQuery}
                onChange={event => setDraftQuery(event.target.value)}
                placeholder="Buscar jogos lançados em 2026 (ex: GTA VI, Cairn, Control Resonant…)"
                className="h-12 w-full rounded-2xl border border-[#dfc06c]/20 bg-[#14131a] pl-10 pr-4 text-sm text-[#fdf8e8] placeholder:text-[#8d8267] outline-none transition focus:border-[#e6c46c]/60"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfc06c]/25 bg-[#dfc06c]/10 px-2.5 py-1 font-bold text-[#f1d68c]">
                <CalendarCheck2 className="size-3.5" />
                {includeAllYears
                  ? 'Mostrando 2026 e outros anos'
                  : 'Priorizando lançamentos comerciais de 2026'}
              </span>

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#b9ae92]">
                <input
                  type="checkbox"
                  checked={includeAllYears}
                  onChange={event => setIncludeAllYears(event.target.checked)}
                  className="size-3.5 accent-[#dfc06c]"
                />
                Incluir outros anos (exceção)
              </label>
            </div>

            {error && (
              <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-200">
                {error} Exibindo catálogo curado de 2026.
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {loading ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2.5 text-xs font-semibold text-[#c5b58d]">
                <LoaderCircle className="size-5 animate-spin text-[#e5c36b]" />
                Verificando lançamentos comerciais de 2026…
              </div>
            ) : results.length === 0 ? (
              <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-[#dfc06c]/20 p-6 text-center">
                <div className="max-w-sm">
                  <Sparkles className="mx-auto size-6 text-[#c4a657]" />
                  <p className="mt-2 text-sm font-bold text-[#f6ecd0]">
                    Nenhum lançamento comercial de 2026 encontrado
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#a89c7f]">
                    Tente outro título ou ative “Incluir outros anos” se a data comercial do jogo ainda não estiver catalogada na IGDB.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {results.map(game => {
                  const isCurrent = selectedTitle?.toLowerCase() === game.title.toLowerCase();
                  const isSaving = savingId === game.id;
                  return (
                    <button
                      key={`${game.id}:${game.igdb_id ?? ''}`}
                      type="button"
                      disabled={Boolean(savingId)}
                      onClick={() => void handleChoose(game)}
                      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-[#dfc06c]/15 bg-[#121118] p-2.5 text-left transition hover:border-[#e6c46c]/50 hover:bg-[#181620] disabled:opacity-60"
                    >
                      <GotyPosterArt
                        title={game.title}
                        imageUrl={game.image_url}
                        compact
                        className="h-20 w-14 shrink-0 rounded-xl border border-white/10"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <strong className="line-clamp-2 text-xs font-extrabold leading-snug text-[#faf4e4]">
                            {game.title}
                          </strong>
                          {isSaving ? (
                            <LoaderCircle className="size-4 shrink-0 animate-spin text-[#e5c36b]" />
                          ) : isCurrent ? (
                            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#e5c36b] text-[#141008]">
                              <Check className="size-3 stroke-[3]" />
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className={
                              game.is_eligible_2026
                                ? 'rounded-full border border-[#dfc06c]/30 bg-[#dfc06c]/12 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#f3da91]'
                                : 'rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400'
                            }
                          >
                            {game.eligibility_label}
                          </span>
                          {game.average_rating != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#c9b98d]">
                              <Star className="size-2.5 fill-[#e5c36b] text-[#e5c36b]" />
                              {game.average_rating}
                            </span>
                          )}
                        </div>

                        {(game.platforms?.length || game.genres?.length) ? (
                          <p className="mt-1.5 truncate text-[10px] font-medium text-[#958a72]">
                            {[...(game.genres || []).slice(0, 2), ...(game.platforms || []).slice(0, 2)].join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
