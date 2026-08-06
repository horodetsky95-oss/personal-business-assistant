(function () {
  const config = window.ASSISTANT_SYNC_CONFIG || {};
  const authKey = "codex.personalBusinessAssistant.supabaseAuth.v1";
  const statusKey = "codex.personalBusinessAssistant.syncStatus.v1";
  const apiReady = () => Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const baseUrl = () => String(config.supabaseUrl || "").replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
  let user = null;
  let busy = false;
  let pushTimer = null;

  function cloudApi() {
    return window.assistantCloud;
  }

  function getAuth() {
    try {
      return JSON.parse(localStorage.getItem(authKey)) || null;
    } catch {
      return null;
    }
  }

  function setAuth(auth) {
    localStorage.setItem(authKey, JSON.stringify(auth));
  }

  function clearAuth() {
    localStorage.removeItem(authKey);
    user = null;
  }

  function markStatus(text) {
    localStorage.setItem(statusKey, text);
    const el = document.querySelector("[data-sync-status]");
    if (el) el.textContent = text;
  }

  function headers(auth) {
    const token = auth?.access_token;
    return {
      apikey: config.supabaseAnonKey,
      Authorization: token ? "Bearer " + token : "Bearer " + config.supabaseAnonKey,
      "Content-Type": "application/json"
    };
  }

  async function request(path, options = {}) {
    const auth = getAuth();
    const res = await fetch(baseUrl() + path, {
      ...options,
      headers: { ...headers(auth), ...(options.headers || {}) }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Ошибка синхронизации");
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function normalizeState(state) {
    state.tasks = state.tasks || [];
    state.business = state.business || [];
    state.notes = state.notes || { profile: "", daily: "", items: [] };
    state.notes.items = state.notes.items || [];
    state.sync = state.sync || {};
    state.sync.updatedAt = state.sync.updatedAt || new Date(0).toISOString();
    return state;
  }

  async function readUser() {
    const auth = getAuth();
    if (!auth?.access_token) return null;
    const data = await request("/auth/v1/user", { method: "GET" });
    user = data;
    return data;
  }

  async function sendMagicLink(email) {
    const redirectTo = location.origin + location.pathname;
    await fetch(baseUrl() + "/auth/v1/otp", {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: "Bearer " + config.supabaseAnonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        create_user: true,
        options: { email_redirect_to: redirectTo }
      })
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
    });
  }

  function captureAuthFromUrl() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const access = hash.get("access_token");
    const refresh = hash.get("refresh_token");
    if (!access) return false;
    setAuth({
      access_token: access,
      refresh_token: refresh,
      expires_at: hash.get("expires_at"),
      token_type: hash.get("token_type") || "bearer"
    });
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  }

  async function pull() {
    if (!apiReady()) {
      markStatus("Облако не настроено");
      return;
    }
    if (busy) return;
    busy = true;
    try {
      const currentUser = user || await readUser();
      if (!currentUser?.id) {
        markStatus("Нужно войти");
        return;
      }
      const rows = await request("/rest/v1/assistant_data?select=payload,updated_at&user_id=eq." + encodeURIComponent(currentUser.id), {
        method: "GET",
        headers: { Prefer: "return=representation" }
      });
      const api = cloudApi();
      if (!api) return;
      const local = normalizeState(api.getState());
      const remote = rows && rows[0] ? normalizeState(rows[0].payload || {}) : null;
      if (!remote) {
        await push(true);
        return;
      }
      const localTime = Date.parse(local.sync?.updatedAt || 0);
      const remoteTime = Date.parse(remote.sync?.updatedAt || rows[0].updated_at || 0);
      if (remoteTime > localTime) {
        api.setState(remote);
        markStatus("Синхронизировано");
      } else if (localTime > remoteTime) {
        await push(true);
      } else {
        markStatus("Синхронизировано");
      }
    } catch (error) {
      markStatus("Ошибка облака");
      console.warn(error);
    } finally {
      busy = false;
    }
  }

  async function push(force) {
    if (!apiReady()) return;
    if (busy && !force) return;
    const currentUser = user || await readUser().catch(() => null);
    if (!currentUser?.id) return;
    const api = cloudApi();
    if (!api) return;
    const payload = normalizeState(api.getState());
    if (payload.sync.updatedAt === new Date(0).toISOString()) {
      payload.sync.updatedAt = new Date().toISOString();
    }
    await request("/rest/v1/assistant_data", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: currentUser.id,
        payload,
        updated_at: payload.sync.updatedAt
      })
    });
    markStatus("Сохранено в облако");
  }

  function schedulePush() {
    if (!apiReady()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(false).catch(() => markStatus("Ошибка облака")), 700);
  }

  async function login() {
    if (!apiReady()) {
      alert("Сначала заполните sync-config.js: Supabase URL и anon public key.");
      return;
    }
    const auth = getAuth();
    if (auth?.access_token) {
      await pull();
      return;
    }
    const email = prompt("Введите email для синхронизации");
    if (!email) return;
    await sendMagicLink(email.trim());
    markStatus("Письмо отправлено");
    alert("Письмо для входа отправлено. Откройте его на этом устройстве.");
  }

  function addUi() {
    const actions = document.querySelector(".actions");
    if (!actions || document.querySelector("#syncButton")) return;
    const button = document.createElement("button");
    button.id = "syncButton";
    button.textContent = "Облако";
    button.onclick = () => login().catch((error) => {
      console.warn(error);
      alert("Не получилось подключить облако. Проверьте настройки Supabase.");
    });
    const status = document.createElement("span");
    status.className = "pill";
    status.dataset.syncStatus = "";
    status.textContent = localStorage.getItem(statusKey) || (apiReady() ? "Облако готово" : "Облако не настроено");
    actions.prepend(status);
    actions.prepend(button);
  }

  async function boot() {
    addUi();
    if (captureAuthFromUrl()) markStatus("Вход выполнен");
    if (apiReady() && getAuth()?.access_token) {
      await pull();
      setInterval(() => pull(), 30000);
    }
  }

  window.AssistantSync = { schedulePush, pull, push, login };
  window.addEventListener("load", () => boot().catch((error) => console.warn(error)));
})();
