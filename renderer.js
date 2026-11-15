document.getElementById('ping').addEventListener('click', async () => {
  document.getElementById('result').textContent = await window.api.ping();
});
