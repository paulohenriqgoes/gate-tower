/**
 * Isola o global `window.CoachingOverlay` do 8th Wall (`@8thwall/coaching-overlay`,
 * MIT) do resto do codigo. Nenhum outro modulo deve tocar nesse global
 * diretamente — so este arquivo.
 */

// Nome do camera pipeline module registrado pelo bundle do coaching overlay,
// confirmado por inspecao. Usado tanto para remove quanto documentado aqui
// para nao repetir a string solta em mais de um lugar.
const COACHING_OVERLAY_MODULE_NAME = "coaching-overlay";

/**
 * Configura e liga o coaching overlay de escala absoluta do 8th Wall.
 * Retorna false quando o script nao carregou — nesse caso a RA segue
 * funcionando sem o overlay, entao NUNCA lance.
 */
export function attachCoachingOverlay(xr8: XR8Api): boolean {
  const coachingOverlay = window.CoachingOverlay;

  if (!coachingOverlay) {
    console.warn("[coachingOverlay] window.CoachingOverlay nao esta disponivel; RA segue sem o overlay");
    return false;
  }

  coachingOverlay.configure({
    promptText: "Mova o celular para frente e para tras",
    promptColor: "#f8fafc",
    animationColor: "#22c55e"
  });

  try {
    xr8.addCameraPipelineModule(coachingOverlay.pipelineModule());
  } catch (error) {
    console.warn("[coachingOverlay] falha ao anexar o pipeline module", error);
    return false;
  }

  return true;
}

/** Remove o modulo; o proprio `onRemove` do overlay desmonta o DOM. */
export function detachCoachingOverlay(xr8: XR8Api): void {
  try {
    xr8.removeCameraPipelineModule(COACHING_OVERLAY_MODULE_NAME);
  } catch (error) {
    console.warn("[coachingOverlay] falha ao remover o pipeline module", error);
  }
}
