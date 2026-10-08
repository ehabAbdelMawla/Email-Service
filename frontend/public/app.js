/* Email Service Frontend - plain JS, no framework */
(function () {
  'use strict';

  var API = 'http://localhost:3000';

  var state = {
    page: 'groups',
    groupId: null,
    jobId: null,
    groups: [],
    message: null
  };

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function api(method, url, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + url, opts).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { data = text; }
        if (!res.ok) {
          throw new Error(typeof data === 'object' && data.message
            ? data.message
            : 'HTTP ' + res.status + ' ' + text);
        }
        return data;
      });
    });
  }

  function showMsg(text, ok) {
    var el = document.getElementById('msg');
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="msg ' + (ok ? 'msg-ok' : 'msg-err') + '">' + esc(text) + '</div>';
  }

  function root() {
    return document.getElementById('root');
  }

  function $(id) {
    return document.getElementById(id);
  }

  /* ---------------- data operations ---------------- */

  function fetchGroups() {
    return api('GET', '/groups').then(function (groups) {
      state.groups = groups || [];
    });
  }

  function fetchGroup(id) {
    return api('GET', '/groups/' + id);
  }

  function loadGroupsAndRender() {
    return fetchGroups().then(render).catch(function (e) {
      showMsg('Failed to load groups: ' + e.message, false);
      render();
    });
  }

  function loadGroupAndRender() {
    return fetchGroup(state.groupId)
      .then(function (group) {
        state.detail = group;
        render();
      })
      .catch(function (e) {
        showMsg('Failed to load group: ' + e.message, false);
        render();
      });
  }

  function loadJobAndRender() {
    api('GET', '/emails/' + state.jobId)
      .then(function (job) {
        state.job = job;
        render();
      })
      .catch(function (e) {
        showMsg('Failed to load job: ' + e.message, false);
        render();
      });
  }

  /* ---------------- page renderers ---------------- */

  function renderGroups() {
    var rows = state.groups.map(function (g) {
      return '<tr>' +
        '<td>' + esc(g.name) + '</td>' +
        '<td class="muted">' + esc(g.description || '') + '</td>' +
        '<td><span class="tag">' + g.receiverCount + '</span></td>' +
        '<td>' +
        '<button class="btn" onclick="App.viewGroup(' + g.id + ')">View</button>' +
        '<button class="btn btn-danger" onclick="App.deleteGroup(' + g.id + ')">Delete</button>' +
        '</td></tr>';
    }).join('');

    var table = state.groups.length > 0
      ? '<table><thead><tr><th>Name</th><th>Description</th><th>Receivers</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table>'
      : '<p class="empty">No groups yet. Create one below.</p>';

    return '<div class="card">' +
      '<h2>Groups</h2>' + table +
      '</div>' +

      '<div class="card">' +
      '<h2>Create Group</h2>' +
      '<label class="label" for="group-name">Name *</label>' +
      '<input class="input" id="group-name" placeholder="e.g. Marketing" />' +
      '<label class="label" for="group-desc">Description</label>' +
      '<input class="input" id="group-desc" placeholder="Optional description" />' +
      '<button class="btn btn-primary" onclick="App.createGroup()">Create Group</button>' +
      '</div>';
  }

  function renderGroupDetail() {
    var g = state.detail;
    if (!g) return '<div class="card">Loading group...</div>';

    var receivers = (g.receivers || []).map(function (r) {
      return '<div class="receiver-row">' +
        '<span>' + esc(r.email) + '</span>' +
        '<button class="btn btn-danger" onclick="App.deleteReceiver(' + g.id + ',' + r.id + ')">Delete</button>' +
        '</div>';
    }).join('');

    if (!receivers) receivers = '<p class="empty">No receivers yet.</p>';

    return '<div class="card">' +
      '<h2>Group: ' + esc(g.name) + '</h2>' +
      '<p class="muted">' + esc(g.description || '') + ' &middot; ' +
      (g.receiverCount || 0) + ' receiver(s)</p>' +

      '<h3>Receivers</h3>' + receivers +

      '<h3>Add Receiver</h3>' +
      '<input class="input" id="receiver-email" type="email" placeholder="email@example.com" />' +
      '<button class="btn btn-primary" onclick="App.addReceiver(' + g.id + ')">Add Receiver</button>' +

      '<div style="margin-top: 1rem;">' +
      '<button class="btn" onclick="App.navigate(\'groups\')">&larr; Back to Groups</button>' +
      '<button class="btn btn-primary" onclick="App.navigate(\'send-email\')">Send Email to Groups</button>' +
      '</div>' +
      '</div>';
  }

  function renderSendEmail() {
    var checkboxes = state.groups.map(function (g) {
      return '<label class="checkbox-row">' +
        '<input type="checkbox" class="group-check" value="' + g.id + '" />' +
        '<span>' + esc(g.name) + '</span>' +
        '<span class="tag">' + g.receiverCount + '</span>' +
        '</label>';
    }).join('');

    if (!checkboxes) checkboxes = '<p class="empty">No groups yet. Create a group first.</p>';

    return '<div class="card">' +
      '<h2>Send Email</h2>' +

      '<label class="label" for="email-subject">Subject *</label>' +
      '<input class="input" id="email-subject" placeholder="Newsletter - October" />' +

      '<span class="label">Groups * (select one or more)</span>' +
      checkboxes +

      '<label class="label" for="email-html">HTML body *</label>' +
      '<textarea class="textarea" id="email-html"><h1>Hello</h1><p>Welcome to our newsletter.</p></textarea>' +

      '<button class="btn btn-primary" id="send-btn" onclick="App.sendEmail()">Send Email</button>' +
      '</div>';
  }

  function renderJobDetail() {
    var j = state.job;
    if (!j) return '<div class="card">Loading job...</div>';

    var recipients = (j.recipients || []).map(function (r) {
      var cls = r.status === 'sent' ? 'status-good' : r.status === 'failed' ? 'status-bad' : '';
      var err = r.error
        ? '<div class="muted" style="color: #dc2626;">' + esc(r.error) + '</div>'
        : '';
      return '<div class="receiver-row" style="flex-direction: column; align-items: flex-start;">' +
        '<div style="display: flex; justify-content: space-between; width: 100%;">' +
        '<span>' + esc(r.email) + '</span>' +
        '<span class="' + cls + '">' + esc(r.status) + '</span>' +
        '</div>' + err +
        '</div>';
    }).join('');

    if (!recipients) recipients = '<p class="empty">No recipients.</p>';

    var done = j.status === 'completed' || j.status === 'failed';

    return '<div class="card">' +
      '<h2>Email Job #' + esc(j.id) + '</h2>' +

      '<div class="stats">' +
      '<span><strong>Status:</strong> <span class="' +
      (j.status === 'completed' ? 'status-good' : done ? 'status-bad' : '') + '">' +
      esc(j.status) + '</span></span>' +
      '<span><strong>Sent:</strong> ' + (j.sentCount || 0) + '</span>' +
      '<span><strong>Failed:</strong> ' + (j.failedCount || 0) + '</span>' +
      '<span><strong>Total:</strong> ' + (j.totalRecipients || 0) + '</span>' +
      '</div>' +

      '<p><strong>Subject:</strong> ' + esc(j.subject) + '</p>' +

      '<h3>Recipients</h3>' +
      recipients +

      '<div style="margin-top: 1rem;">' +
      '<button class="btn" onclick="App.refreshJob()">Refresh</button>' +
      '<button class="btn btn-primary" onclick="App.navigate(\'groups\')">&larr; Back to Groups</button>' +
      '</div>' +
      '</div>';
  }

  /* ---------------- router / render ---------------- */

  function render() {
    var html = '';
    if (state.page === 'groups') html = renderGroups();
    else if (state.page === 'group-detail') html = renderGroupDetail();
    else if (state.page === 'send-email') html = renderSendEmail();
    else if (state.page === 'job-detail') html = renderJobDetail();
    root().innerHTML = html;
  }

  function navigate(page) {
    state.page = page;
    state.detail = null;
    state.job = null;
    showMsg(null);

    if (page === 'groups') {
      loadGroupsAndRender();
    } else if (page === 'send-email') {
      fetchGroups().then(render).catch(function (e) {
        showMsg('Failed to load groups: ' + e.message, false);
        render();
      });
    } else {
      render();
    }
  }

  /* ---------------- actions ---------------- */

  function createGroup() {
    var name = $('group-name').value.trim();
    var description = $('group-desc').value.trim();
    if (!name) { showMsg('Group name is required', false); return; }

    api('POST', '/groups', { name: name, description: description })
      .then(function () {
        showMsg('Group "' + name + '" created', true);
        navigate('groups');
      })
      .catch(function (e) { showMsg('Create failed: ' + e.message, false); });
  }

  function viewGroup(id) {
    state.page = 'group-detail';
    state.groupId = id;
    state.detail = null;
    showMsg(null);
    render();
    loadGroupAndRender();
  }

  function deleteGroup(id) {
    if (!confirm('Delete this group and its receivers?')) return;
    api('DELETE', '/groups/' + id)
      .then(function () {
        showMsg('Group deleted', true);
        if (state.page === 'group-detail') navigate('groups');
        else loadGroupsAndRender();
      })
      .catch(function (e) { showMsg('Delete failed: ' + e.message, false); });
  }

  function addReceiver(groupId) {
    var input = $('receiver-email');
    var email = input.value.trim();
    if (!email) { showMsg('Email is required', false); return; }

    api('POST', '/groups/' + groupId + '/receivers', { email: email })
      .then(function () {
        input.value = '';
        showMsg('Receiver ' + email + ' added', true);
        loadGroupAndRender();
      })
      .catch(function (e) { showMsg('Add failed: ' + e.message, false); });
  }

  function deleteReceiver(groupId, receiverId) {
    api('DELETE', '/groups/' + groupId + '/receivers/' + receiverId)
      .then(function () {
        showMsg('Receiver removed', true);
        loadGroupAndRender();
      })
      .catch(function (e) { showMsg('Delete failed: ' + e.message, false); });
  }

  function sendEmail() {
    var subject = $('email-subject').value.trim();
    var html = $('email-html').value;
    var groupIds = Array.prototype.slice
      .call(document.querySelectorAll('.group-check:checked'))
      .map(function (cb) { return parseInt(cb.value, 10); });

    if (!subject) { showMsg('Subject is required', false); return; }
    if (groupIds.length === 0) { showMsg('Select at least one group', false); return; }
    if (!html.trim()) { showMsg('HTML body is required', false); return; }

    var btn = $('send-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    api('POST', '/emails/send', { subject: subject, html: html, groupIds: groupIds })
      .then(function (resp) {
        showMsg('Email queued! Job #' + resp.jobId + ' for ' + resp.receiverCount + ' receiver(s)', true);
        state.page = 'job-detail';
        state.jobId = resp.jobId;
        state.job = null;
        render();
        loadJobAndRender();
      })
      .catch(function (e) {
        showMsg('Send failed: ' + e.message, false);
        btn.disabled = false;
        btn.textContent = 'Send Email';
      });
  }

  function refreshJob() {
    loadJobAndRender();
  }

  /* ---------------- auto-refresh job status ---------------- */

  setInterval(function () {
    if (state.page === 'job-detail' && state.jobId && state.job &&
        state.job.status !== 'completed' && state.job.status !== 'failed' &&
        state.job.status !== 'completed_with_errors') {
      loadJobAndRender();
    }
  }, 2000);

  /* ---------------- boot ---------------- */

  window.App = {
    navigate: navigate,
    createGroup: createGroup,
    viewGroup: viewGroup,
    deleteGroup: deleteGroup,
    addReceiver: addReceiver,
    deleteReceiver: deleteReceiver,
    sendEmail: sendEmail,
    refreshJob: refreshJob
  };

  document.addEventListener('DOMContentLoaded', function () {
    navigate('groups');
  });
})();
