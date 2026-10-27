// Contas e papéis da TUFEISEP.
//  admin       edita todo o site e gere o repertório
//  dirmusical  gere o repertório da área reservada
//  tunante     vê a área reservada
//  caloira     vê a área reservada
// As permissões verdadeiras estão na base de dados (supabase/migracoes/007_area_reservada.sql);
// aqui só se decide o que mostrar.
// Entra-se com um nome de utilizador. O Supabase exige um email por conta, por isso cada
// utilizador tem um email interno <utilizador>@tufeisep.local, que ninguém precisa de conhecer.
import { sb } from './supabase.js';
import { api } from './api.js';

const INTERNAL_DOMAIN = 'tufeisep.local';
const toEmail = user => `${user.trim().toLowerCase()}@${INTERNAL_DOMAIN}`;

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

export async function signIn(username, password) {
  cachedRole = undefined;
  if (!sb) {
    // Backend próprio: só existe a conta de edição.
    await api.login(password);
    return 'admin';
  }
  if (!/^[a-z0-9._-]+$/i.test(username.trim())) throw new Error('Escreve o teu nome de utilizador, sem espaços.');
  const { error } = await sb.auth.signInWithPassword({ email: toEmail(username), password });
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
          <input id="loginUser" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
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
