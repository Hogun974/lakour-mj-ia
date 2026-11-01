// Compte à rebours des fenêtres de décision : « m:ss » dans .lakour-mjia-minuteur ; à zéro, aZero est appelé une fois.
export function demarrerMinuteur(app, finit, aZero) {
  clearInterval(app._minuterie);
  const zone = app.element?.querySelector(".lakour-mjia-minuteur");
  let fini = false;
  const tic = () => {
    const reste = Math.max(0, Math.ceil((finit - Date.now()) / 1000));
    if (zone) {
      zone.textContent = `${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, "0")}`;
      zone.classList.toggle("urgent", reste > 0 && reste <= 10);
    }
    if (reste <= 0 && !fini) {
      fini = true;
      clearInterval(app._minuterie);
      aZero?.();
    }
  };
  app._minuterie = setInterval(tic, 1000);
  tic();
  return app._minuterie;
}
