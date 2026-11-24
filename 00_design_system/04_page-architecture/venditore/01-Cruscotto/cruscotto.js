// Sidebar comprimibile a sola-icona — Cruscotto Venditore v2
document.addEventListener('DOMContentLoaded', () => {
  const shell = document.querySelector('.shell');
  const toggleBtn = document.getElementById('sidebarToggle');

  if (!shell || !toggleBtn) return;

  // Click: alterna tra sidebar piena (icona+label) e sidebar compressa
  // (solo icone, dimensioni come .icon-btn) — resta sempre in vista e
  // in flusso, il workspace si riadatta di conseguenza.
  toggleBtn.addEventListener('click', () => {
    shell.classList.toggle('sidebar-collapsed');
  });
});
