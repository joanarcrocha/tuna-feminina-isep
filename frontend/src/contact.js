// Formulário de contacto: envia a mensagem para o email da tuna através do Web3Forms
// (serviço gratuito, sem servidor próprio). A chave de acesso é pública por natureza:
// só permite enviar mensagens para o email com que foi criada (tufeisep@gmail.com).
const TUNA_EMAIL = 'tufeisep@gmail.com';
const ACCESS_KEY = import.meta.env.VITE_WEB3FORMS_KEY;
const ENDPOINT = 'https://api.web3forms.com/submit';

export function mountContact() {
  const dlg = document.querySelector('#contact');
  const form = document.querySelector('#contactForm');
  const err = document.querySelector('#contactErr');
  const sent = document.querySelector('#contactSent');
  const send = document.querySelector('#contactSend');

  const open = () => {
    form.hidden = false;
    sent.hidden = true;
    err.hidden = true;
    dlg.showModal();
    form.querySelector('#cAssunto').focus();
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-contact]')) return;
    e.preventDefault();
    open();
  });
  if (location.hash === '#contacto') open();

  document.querySelector('#contactCancel').onclick = () => dlg.close();
  document.querySelector('#contactClose').onclick = () => dlg.close();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const assunto = String(fd.get('assunto') || '').trim();
    const remetente = String(fd.get('email') || '').trim();
    const mensagem = String(fd.get('mensagem') || '').trim();
    const showErr = msg => { err.textContent = msg; err.hidden = false; };

    if (!assunto) return showErr('Escreve o assunto da mensagem.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(remetente)) return showErr('Escreve o teu email, para te podermos responder.');
    if (!mensagem) return showErr('Escreve a mensagem.');
    if (fd.get('botcheck')) return; // campo escondido: só os robôs o preenchem
    if (!ACCESS_KEY) return showErr(`O formulário ainda não está configurado. Por agora, escreve para ${TUNA_EMAIL}.`);

    err.hidden = true;
    send.disabled = true;
    send.textContent = 'A enviar…';
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: ACCESS_KEY,
          subject: `Site TUFEISEP: ${assunto}`,
          from_name: 'Site TUFEISEP',
          replyto: remetente,     // "Responder" no Gmail vai para quem escreveu
          Assunto: assunto,
          Remetente: remetente,
          Mensagem: mensagem,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || 'falhou');
      form.reset();
      form.hidden = true;
      sent.hidden = false;
    } catch {
      showErr(`Não foi possível enviar a mensagem. Tenta outra vez daqui a pouco, ou escreve diretamente para ${TUNA_EMAIL}.`);
    } finally {
      send.disabled = false;
      send.textContent = 'Enviar mensagem';
    }
  });
}
