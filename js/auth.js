/**
 * Authentication Module
 * Manages JWT tokens, user state, login/logout, and page protection.
 */
(function (global) {
  'use strict';

  const AUTH = {
    TOKEN_KEY: 'token',
    USER_KEY: 'user',

    /**
     * Get stored JWT token
     * @returns {string|null}
     */
    getToken() {
      try {
        return localStorage.getItem(this.TOKEN_KEY);
      } catch (err) {
        console.warn('localStorage not available:', err);
        return null;
      }
    },

    /**
     * Get stored user details
     * @returns {object|null}
     */
    getUser() {
      try {
        const userStr = localStorage.getItem(this.USER_KEY);
        return userStr ? JSON.parse(userStr) : null;
      } catch (err) {
        console.warn('Error reading user from localStorage:', err);
        return null;
      }
    },

    getRole() {
      const role = this.getUser()?.role;
      return role === 'admin' || role === 'faculty' ? role : null;
    },

    getFacultyId() {
      const facultyId = this.getUser()?.facultyId;
      if (typeof facultyId === 'string') return facultyId;
      return facultyId?._id || facultyId?.id || facultyId?.facultyCode || null;
    },

    applyRoleUI() {
      const role = this.getRole();
      const body = global.document && global.document.body;
      if (!body) return;

      if (role) body.dataset.role = role;
      else delete body.dataset.role;

      body.querySelectorAll('[data-admin-only], [data-faculty-only]').forEach(element => {
        const visible = element.hasAttribute('data-admin-only')
          ? role === 'admin'
          : role === 'faculty';
        element.hidden = !visible;
        element.setAttribute('aria-hidden', String(!visible));
      });

      body.querySelectorAll('[data-role-label]').forEach(element => {
        const label = role === 'admin' ? element.dataset.adminLabel : element.dataset.facultyLabel;
        if (label) element.textContent = label;
      });
    },

    /**
     * Store authentication token and user profile
     * @param {string} token 
     * @param {object} user 
     */
    setAuth(token, user) {
      try {
        if (token) localStorage.setItem(this.TOKEN_KEY, token);
        if (user) localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      } catch (err) {
        console.warn('Error saving to localStorage:', err);
      }
    },

    /**
     * Clear all stored credentials
     */
    clearAuth() {
      try {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
      } catch (err) {
        console.warn('Error clearing localStorage:', err);
      }
    },

    /**
     * Check if user is currently authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
      return Boolean(this.getToken());
    },

    /**
     * Build full API endpoint URL
     * @param {string} path 
     * @returns {string}
     */
    getApiUrl(path) {
      const base = (global.APP_CONFIG && global.APP_CONFIG.API_BASE_URL) || 'http://localhost:5000/api';
      const cleanPath = path.startsWith('/') ? path : '/' + path;
      return `${base}${cleanPath}`;
    },

    /**
     * Authenticate with email & password via POST /api/auth/login
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<{token: string, user: object}>}
     */
    async login(email, password) {
      let response;
      try {
        response = await fetch(this.getApiUrl('/auth/login'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password })
        });
      } catch (networkErr) {
        const err = new Error('Unable to connect to the authentication server. Please verify backend is running.');
        err.isNetworkError = true;
        throw err;
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        const err = new Error(`Server returned invalid response (HTTP ${response.status})`);
        err.status = response.status;
        throw err;
      }

      if (!response.ok || !data || !data.success) {
        const message = (data && data.message) || 'Invalid email or password';
        const err = new Error(message);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      this.setAuth(data.data.token, data.data.user);
      return data.data;
    },

    /**
     * Log out current user and redirect to login page
     */
    logout() {
      this.clearAuth();
      global.location.replace('index.html');
    },

    /**
     * Protect page route - redirects unauthenticated users to index.html
     * @returns {boolean} True if authenticated, false if redirecting
     */
    protectPage(options = {}) {
      const role = this.getRole();
      if (!this.isAuthenticated() || !role) {
        global.location.replace('index.html');
        return false;
      }

      if (options.adminOnly && role !== 'admin') {
        global.location.replace('dashboard.html');
        return false;
      }

      if (options.facultyProfile && role === 'faculty') {
        const facultyId = this.getFacultyId();
        const user = this.getUser();
        const faculty = user && user.facultyId;
        const allowedIds = [facultyId, faculty && faculty.facultyCode].filter(Boolean).map(String);
        const requestedId = new URLSearchParams(global.location.search).get('id');
        if (!facultyId) {
          global.location.replace('dashboard.html');
          return false;
        }
        if (!requestedId) {
          global.location.replace(`faculty-profile.html?id=${encodeURIComponent(facultyId)}`);
          return false;
        }
        if (!allowedIds.includes(requestedId)) {
          global.location.replace(`faculty-profile.html?id=${encodeURIComponent(facultyId)}`);
          return false;
        }
      }
      return true;
    },

    /**
     * Populate topbar user display (name, role, initials) and bind logout handler
     */
    initUserDisplay() {
      const user = this.getUser();
      if (!user) return;

      const userDot = document.getElementById('userDot');
      const userName = document.getElementById('userName');
      const userRole = document.getElementById('userRole');
      const logoutBtn = document.getElementById('logoutBtn');

      if (userName && user.name) {
        userName.textContent = user.name;
      }

      if (userRole && user.role) {
        userRole.textContent = user.role === 'admin' ? 'Administrator' : 'Faculty';
      }

      if (userDot && user.name) {
        const cleaned = user.name.replace(/^Dr\.\s*/i, '').trim();
        const parts = cleaned.split(/\s+/);
        const initials = parts.length === 1 
          ? parts[0].substring(0, 2).toUpperCase() 
          : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        userDot.textContent = initials;
      }

      if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.logout();
        });
      }
    }
  };

  global.AUTH = AUTH;

  if (global.document) {
    const applyRole = () => AUTH.applyRoleUI();
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', applyRole, { once: true });
    } else {
      applyRole();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AUTH;
  }
})(typeof window !== 'undefined' ? window : globalThis);
