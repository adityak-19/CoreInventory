// Modal helpers
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close modal on backdrop click
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
});

// Tab switching
function switchTab(tabGroup, value, el) {
  const url = new URL(window.location);
  url.searchParams.set('status', value);
  window.location = url.toString();
}

// Auto-dismiss alerts after 4s
document.addEventListener('DOMContentLoaded', function() {
  const alerts = document.querySelectorAll('.alert-auto');
  alerts.forEach(a => setTimeout(() => a.style.display = 'none', 4000));
});
