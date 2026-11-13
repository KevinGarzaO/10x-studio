/**
 * Discovery cron: DESHABILITADO.
 * Solo se usan fuentes ATS (Lever, Workable, Greenhouse).
 * No se buscan canales de Telegram ni se usa IA para descubrir fuentes.
 */
export async function runDiscovery(
  _profileName: string,
  log: (msg: string) => void = () => {}
): Promise<{
  tested: number;
  promoted: number;
  rejected: number;
  newChannels: string[];
}> {
  log(`[Discovery] Deshabilitado — solo fuentes ATS activas.`);
  return { tested: 0, promoted: 0, rejected: 0, newChannels: [] };
}

export async function runDiscoveryAll(
  log: (msg: string) => void = () => {}
): Promise<void> {
  log(`[Discovery] Deshabilitado — solo fuentes ATS activas.`);
}
