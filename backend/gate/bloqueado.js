const form = document.getElementById('form');
const erro = document.getElementById('erro');
const botao = form.querySelector('button');

form.addEventListener('submit', async e => {
  e.preventDefault();
  erro.hidden = true;
  botao.disabled = true;
  try {
    const r = await fetch('/bloqueado/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palavraPasse: form.palavraPasse.value }),
    });
    if (r.ok) return location.reload();
    erro.textContent = (await r.json().catch(() => ({}))).erro || 'Não foi possível entrar.';
  } catch {
    erro.textContent = 'Sem ligação. Tenta outra vez.';
  }
  erro.hidden = false;
  botao.disabled = false;
  form.palavraPasse.select();
});
