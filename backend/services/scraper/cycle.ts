import { supabase } from "../supabase.service";

const CYCLE_ROW_ID = 1;

export interface CycleState {
  cycleStartedAt: Date | null;
}

export async function getCycleState(): Promise<CycleState> {
  const { data, error } = await supabase
    .from("scraper_cycle_state")
    .select("cycle_started_at")
    .eq("id", CYCLE_ROW_ID)
    .single();

  if (error) throw error;
  return { cycleStartedAt: data?.cycle_started_at ? new Date(data.cycle_started_at) : null };
}

/**
 * True when no cycle has ever started, or the current one is at least
 * `days` old — Production only runs (and the sweep only fires) when this
 * returns true.
 */
export async function isCycleDue(days: number): Promise<boolean> {
  const { cycleStartedAt } = await getCycleState();
  if (!cycleStartedAt) return true;
  const elapsedMs = Date.now() - cycleStartedAt.getTime();
  return elapsedMs >= days * 24 * 60 * 60 * 1000;
}

export async function startNewCycle(): Promise<void> {
  const { error } = await supabase
    .from("scraper_cycle_state")
    .update({ cycle_started_at: new Date().toISOString() })
    .eq("id", CYCLE_ROW_ID);
  if (error) throw error;
}
