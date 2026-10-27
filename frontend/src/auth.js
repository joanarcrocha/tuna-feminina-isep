// Contas e papéis da TUFEISEP.
//  admin       edita todo o site e gere o repertório
//  dirmusical  gere o repertório da área reservada
//  tunante     vê a área reservada
//  caloira     vê a área reservada
// As permissões verdadeiras estão na base de dados (supabase/migracoes/007_area_reservada.sql);
// aqui só se decide o que mostrar.
import { sb } from './supabase.js';
import { api } from './api.js';

export const USERS = [
  { id: 'admin',      label: 'Administração',   email: import.meta.env.VITE_EDITOR_EMAIL },
  { id: 'dirmusical', label: 'Direção musical', email: 'tufeisep+dirmusical@gmail.com' },
  { id: 'tunantes',   label: 'Tunantes',        email: 'tufeisep+tunantes@gmail.com' },
  { id: 'caloiras',   label: 'Caloiras',        email: 'tufeisep+caloiras@gmail.com' },
];
export const ROLE_LABEL = { admin: 'Administração', dirmusical: 'Direção musical', tunante: 'Tunantes', caloira: 'Caloiras' };
export const hasReservedArea = Boolean(sb);
export const canManageMusic = role => role === 'admin' || role === 'dirmusical';

let cachedRole;

export async function getRole() {
  if (cachedRole !== undefined) return cachedRole;
  if (!sb) return (cachedRole = (await api.hasSession()) ? 'admin' : null);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (cachedRole = null);
  const { data, error } = await sb.rpc('meu_papel');
  return (cachedRole = error ? null : data);
}

export async function signIn(userId, password) {
  cachedRole = undefined;
  if (!sb) {
    // Backend próprio: só existe a conta de edição.
    await api.login(password);
    return 'admin';
  }
  const user = USERS.find(u => u.id === userId);
  const { error } = await sb.auth.signInWithPassword({ email: user?.email || '', password });
  if (error) {
    throw new Error(error.status === 429 ? 'Demasiadas tentativas. Tenta outra vez daqui a pouco.' : 'Utilizador ou palavra-passe errados.');
  }
  const role = await getRole();
  if (!role) {
    await sb.auth.signOut();
    cachedRole = undefined;
    throw new Error('Esta conta ainda não tem acesso. Pede à Administração para a autorizar.');
  }
  return role;
}

export async function signOut() {
  cachedRole = undefined;
  if (sb) await sb.auth.signOut();
  else await api.logout();
}

// Janela de entrada, igual nas duas páginas. Resolve com o papel, ou null se a pessoa cancelar.
export function askLogin() {
  let dlg = document.querySelector('#login');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'login';
    dlg.innerHTML = `
      <form class="form" id="loginForm" novalidate>
        <h3>Entrar</h3>
        <p class="form-intro">Área reservada às tunantes e caloiras da TUFEISEP.</p>
        <div class="field" id="loginUserField">
          <label for="loginUser">Utilizador</label>
          <select id="loginUser">${USERS.map(u => `<option value="${u.id}">${u.label}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="loginPass">Palavra-passe</label>
          <input id="loginPass" type="password" autocomplete="current-password" required>
        </div>
        <p class="form-err" id="loginErr" role="alert" hidden></p>
        <div class="actions">
          <button type="button" class="btn" id="loginCancel">Cancelar</button>
          <button type="submit" class="btn primary" id="loginGo">Entrar</button>
        </div>
      </form>`;
    document.body.append(dlg);
    if (!sb) dlg.querySelector('#loginUserField').hidden = true;
  }
  const form = dlg.querySelector('#loginForm');
  const err = dlg.querySelector('#loginErr');
  const go = dlg.querySelector('#loginGo');
  err.hidden = true;
  dlg.querySelector('#loginPass').value = '';

  return new Promise(resolve => {
    const done = role => {
      form.onsubmit = null;
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(role);
    };
    dlg.querySelector('#loginCancel').onclick = () => done(null);
    dlg.onclose = () => done(null);
    form.onsubmit = async e => {
      e.preventDefault();
      go.disabled = true;
      go.textContent = 'A entrar…';
      try {
        done(await signIn(dlg.querySelector('#loginUser').value, dlg.querySelector('#loginPass').value));
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      } finally {
        go.disabled = false;
        go.textContent = 'Entrar';
      }
    };
    dlg.showModal();
    dlg.querySelector(sb ? '#loginUser' : '#loginPass').focus();
  });
}
