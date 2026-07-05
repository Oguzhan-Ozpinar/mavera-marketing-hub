<template>
  <private-view title="Dublon Kontrol">
    <template #actions:primary>
      <v-button :loading="scanning" @click="scan">Tara</v-button>
    </template>

    <div class="dm-page">
      <aside class="dm-list">
        <div class="dm-list-header">
          <strong>Bekleyen oneriler</strong>
          <span>{{ candidates.length }}</span>
        </div>

        <button
          v-for="candidate in candidates"
          :key="candidate.id"
          class="dm-candidate"
          :class="{ active: selected?.id === candidate.id }"
          @click="selectCandidate(candidate)"
        >
          <span class="dm-score">{{ candidate.score }}</span>
          <span>
            <b>{{ candidate.contact_a_name || displayName(candidate.contactA) }}</b>
            <small>{{ candidate.contact_b_name || displayName(candidate.contactB) }}</small>
          </span>
        </button>

        <p v-if="!loading && candidates.length === 0" class="dm-empty">Bekleyen dublon onerisi yok.</p>
      </aside>

      <main class="dm-detail">
        <div v-if="notice" class="dm-notice" :class="notice.kind">
          {{ notice.text }}
        </div>

        <div v-if="loading" class="dm-muted">Yukleniyor...</div>
        <div v-else-if="!selected" class="dm-muted">Incelenecek oneriyi sec.</div>

        <template v-else>
          <section class="dm-contact-grid">
            <article class="dm-contact-card" :class="{ selected: masterId === selected.contact_a }">
              <div class="dm-card-top">
                <div>
                  <div class="dm-kicker">Contact A</div>
                  <h2>{{ displayName(selected.contactA) }}</h2>
                </div>
                <span class="dm-master-badge" v-if="masterId === selected.contact_a">Master</span>
              </div>
              <dl>
                <div><dt>Telefon</dt><dd>{{ formatValue(selected.contactA?.phone) }}</dd></div>
                <div><dt>E-posta</dt><dd>{{ formatValue(selected.contactA?.email) }}</dd></div>
                <div><dt>Referans</dt><dd>{{ formatValue(selected.contactA?.referans) }}</dd></div>
                <div><dt>Bağış</dt><dd>{{ donationText(selected.contactA) }}</dd></div>
              </dl>
              <div class="dm-card-actions">
                <button class="dm-link-button" @click="masterId = selected.contact_a; loadPreview()">Master seç</button>
                <a :href="contactHref(selected.contact_a)">Contact'a git</a>
              </div>
            </article>

            <article class="dm-contact-card" :class="{ selected: masterId === selected.contact_b }">
              <div class="dm-card-top">
                <div>
                  <div class="dm-kicker">Contact B</div>
                  <h2>{{ displayName(selected.contactB) }}</h2>
                </div>
                <span class="dm-master-badge" v-if="masterId === selected.contact_b">Master</span>
              </div>
              <dl>
                <div><dt>Telefon</dt><dd>{{ formatValue(selected.contactB?.phone) }}</dd></div>
                <div><dt>E-posta</dt><dd>{{ formatValue(selected.contactB?.email) }}</dd></div>
                <div><dt>Referans</dt><dd>{{ formatValue(selected.contactB?.referans) }}</dd></div>
                <div><dt>Bağış</dt><dd>{{ donationText(selected.contactB) }}</dd></div>
              </dl>
              <div class="dm-card-actions">
                <button class="dm-link-button" @click="masterId = selected.contact_b; loadPreview()">Master seç</button>
                <a :href="contactHref(selected.contact_b)">Contact'a git</a>
              </div>
            </article>
          </section>

          <section class="dm-summary">
            <div>
              <div class="dm-kicker">Benzerlik skoru</div>
              <div class="dm-big-score">{{ selected.score }}</div>
            </div>
            <div class="dm-reasons">
              <div class="dm-kicker">Neden dublon dedim?</div>
              <ul>
                <li v-for="reason in selected.reasons" :key="reason">{{ reason }}</li>
              </ul>
            </div>
          </section>

          <section class="dm-master">
            <label>
              <input type="radio" :value="selected.contact_a" v-model="masterId" @change="loadPreview" />
              Master: {{ displayName(selected.contactA) }}
            </label>
            <label>
              <input type="radio" :value="selected.contact_b" v-model="masterId" @change="loadPreview" />
              Master: {{ displayName(selected.contactB) }}
            </label>
          </section>

          <section v-if="preview" class="dm-table-wrap">
            <table class="dm-table">
              <thead>
                <tr>
                  <th>Alan</th>
                  <th>Master</th>
                  <th>Diger kayit</th>
                  <th>Son deger</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in preview.preview.fields" :key="field.field" :class="{ conflict: field.conflict }">
                  <td>
                    <b>{{ field.label }}</b>
                    <small v-if="field.conflict">Cakisma var</small>
                  </td>
                  <td>{{ formatValue(field.masterValue) }}</td>
                  <td>{{ formatValue(field.duplicateValue) }}</td>
                  <td>
                    <select
                      v-if="field.type === 'boolean'"
                      :value="stringFieldValue(field.field, field.value)"
                      @change="setOverride(field.field, ($event.target as HTMLSelectElement).value === 'true')"
                    >
                      <option value="true">Evet</option>
                      <option value="false">Hayir</option>
                    </select>
                    <textarea
                      v-else-if="field.field === 'adres' || field.type === 'json'"
                      :value="stringFieldValue(field.field, field.value)"
                      rows="2"
                      @change="setOverride(field.field, ($event.target as HTMLTextAreaElement).value)"
                    />
                    <input
                      v-else
                      :value="stringFieldValue(field.field, field.value)"
                      @change="setOverride(field.field, ($event.target as HTMLInputElement).value)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <footer class="dm-actions">
            <div class="dm-action-copy">
              <strong>{{ displayName(masterContact) }}</strong> master kalacak; diğer kayıt pasiflenip ilişkileri master'a taşınacak.
            </div>
            <div class="dm-action-buttons">
              <v-button secondary :loading="rejecting" @click="reject">Dublon değil</v-button>
              <v-button :loading="merging" @click="merge">Merge et</v-button>
            </div>
          </footer>
        </template>
      </main>
    </div>
  </private-view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useApi } from "@directus/extensions-sdk";

const api = useApi();

const loading = ref(true);
const scanning = ref(false);
const rejecting = ref(false);
const merging = ref(false);
const candidates = ref<any[]>([]);
const selected = ref<any | null>(null);
const preview = ref<any | null>(null);
const masterId = ref<string>("");
const overrides = ref<Record<string, unknown>>({});
const notice = ref<{ kind: "success" | "info"; text: string } | null>(null);

const selectedIndex = computed(() => candidates.value.findIndex((item) => item.id === selected.value?.id));
const masterContact = computed(() => {
  if (!selected.value) return null;
  return masterId.value === selected.value.contact_b ? selected.value.contactB : selected.value.contactA;
});

onMounted(loadCandidates);

async function loadCandidates() {
  loading.value = true;
  const response = await api.get("/duplicate-manager/candidates", { params: { status: "pending", limit: 100 } });
  candidates.value = response.data.candidates;
  if (!selected.value && candidates.value.length > 0) await selectCandidate(candidates.value[0]);
  loading.value = false;
}

async function selectCandidate(candidate: any) {
  selected.value = candidate;
  masterId.value = candidate.contact_a;
  overrides.value = {};
  await loadPreview();
}

async function loadPreview() {
  if (!selected.value) return;
  const response = await api.post(`/duplicate-manager/${selected.value.id}/preview`, {
    masterId: masterId.value,
    fieldValues: overrides.value,
  });
  preview.value = response.data;
}

async function setOverride(field: string, value: unknown) {
  overrides.value = { ...overrides.value, [field]: value };
  await loadPreview();
}

async function scan() {
  scanning.value = true;
  await api.post("/duplicate-manager/scan", { limit: 1000, threshold: 55 });
  selected.value = null;
  preview.value = null;
  await loadCandidates();
  showNotice("info", "Dublon taraması tamamlandı.");
  scanning.value = false;
}

async function reject() {
  if (!selected.value) return;
  const aName = displayName(selected.value.contactA);
  const bName = displayName(selected.value.contactB);
  rejecting.value = true;
  await api.post(`/duplicate-manager/${selected.value.id}/reject`);
  showNotice("info", `${aName} ve ${bName} dublon değil olarak işaretlendi.`);
  await advance();
  rejecting.value = false;
}

async function merge() {
  if (!selected.value) return;
  const masterName = displayName(masterContact.value);
  const duplicate = masterId.value === selected.value.contact_b ? selected.value.contactA : selected.value.contactB;
  const duplicateName = displayName(duplicate);
  merging.value = true;
  await api.post(`/duplicate-manager/${selected.value.id}/merge`, {
    masterId: masterId.value,
    fieldValues: overrides.value,
  });
  showNotice("success", `${masterName} master kaldı; ${duplicateName} pasiflendi ve ilişkileri master kayda taşındı.`);
  await advance();
  merging.value = false;
}

async function advance() {
  const nextIndex = Math.max(selectedIndex.value, 0);
  selected.value = null;
  preview.value = null;
  await loadCandidates();
  if (candidates.value[nextIndex]) await selectCandidate(candidates.value[nextIndex]);
}

function displayName(contact: any): string {
  if (!contact) return "-";
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
  return name || contact.email || contact.phone || contact.id;
}

function contactHref(id: string): string {
  return `/admin/content/Contacts/${id}`;
}

function donationText(contact: any): string {
  if (!contact) return "-";
  const count = Number(contact.donation_count ?? 0);
  const total = Number(contact.donation_total ?? 0);
  if (!count && !total) return "-";
  return `${count} adet / ${total} TL`;
}

function showNotice(kind: "success" | "info", text: string) {
  notice.value = { kind, text };
  window.setTimeout(() => {
    if (notice.value?.text === text) notice.value = null;
  }, 6000);
}

function formatValue(value: unknown): string {
  if (value === true) return "Evet";
  if (value === false) return "Hayir";
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stringFieldValue(field: string, value: unknown): string {
  if (overrides.value[field] !== undefined) return String(overrides.value[field]);
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
</script>

<style scoped>
.dm-page {
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  gap: 24px;
  padding: 24px;
}

.dm-list,
.dm-detail,
.dm-summary,
.dm-table-wrap,
.dm-contact-card {
  border: 1px solid var(--border-normal);
  border-radius: 8px;
  background: var(--background-page);
}

.dm-list {
  overflow: hidden;
}

.dm-list-header,
.dm-actions,
.dm-master {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subdued);
}

.dm-candidate {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: 0;
  border-bottom: 1px solid var(--border-subdued);
  color: var(--foreground-normal);
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.dm-candidate.active,
.dm-candidate:hover {
  background: var(--background-normal);
}

.dm-candidate small {
  display: block;
  margin-top: 2px;
  color: var(--foreground-subdued);
}

.dm-score,
.dm-big-score {
  color: var(--primary);
  font-weight: 700;
}

.dm-score {
  display: grid;
  place-items: center;
  height: 36px;
  border: 1px solid var(--primary);
  border-radius: 6px;
}

.dm-detail {
  min-width: 0;
  overflow: hidden;
  padding: 16px;
}

.dm-notice {
  margin-bottom: 16px;
  border: 1px solid var(--border-normal);
  border-radius: 8px;
  padding: 12px 14px;
  color: var(--foreground-normal);
  font-weight: 600;
}

.dm-notice.success {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.1);
}

.dm-notice.info {
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.09);
}

.dm-summary {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 18px;
  margin-bottom: 16px;
  padding: 16px;
}

.dm-contact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.dm-contact-card {
  padding: 16px;
}

.dm-contact-card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

.dm-card-top,
.dm-card-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.dm-contact-card h2 {
  margin: 0;
  color: var(--foreground-normal);
  font-size: 22px;
  line-height: 1.2;
}

.dm-master-badge {
  border-radius: 999px;
  padding: 4px 8px;
  color: var(--primary);
  background: var(--primary-10);
  font-size: 12px;
  font-weight: 700;
}

.dm-contact-card dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
  margin: 16px 0;
}

.dm-contact-card dt {
  color: var(--foreground-subdued);
  font-size: 12px;
  font-weight: 600;
}

.dm-contact-card dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
}

.dm-card-actions {
  align-items: center;
}

.dm-card-actions a,
.dm-link-button {
  border: 0;
  padding: 0;
  color: var(--primary);
  background: transparent;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

.dm-big-score {
  font-size: 44px;
  line-height: 1;
}

.dm-kicker {
  margin-bottom: 6px;
  color: var(--foreground-subdued);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.dm-reasons ul {
  margin: 0;
  padding-left: 18px;
}

.dm-master {
  justify-content: flex-start;
  margin-bottom: 16px;
  border: 1px solid var(--border-normal);
  border-radius: 8px;
}

.dm-master label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dm-table-wrap {
  overflow-x: auto;
  padding: 8px;
  background: transparent;
}

.dm-table {
  width: 100%;
  overflow: hidden;
  border-collapse: collapse;
  border-radius: 6px;
}

.dm-table th,
.dm-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subdued);
  text-align: left;
  vertical-align: top;
}

.dm-table th {
  color: var(--foreground-subdued);
  background: rgba(148, 163, 184, 0.06);
  font-size: 12px;
  font-weight: 600;
}

.dm-table tbody tr {
  background: rgba(15, 23, 42, 0.12);
}

.dm-table tbody tr:nth-child(even) {
  background: rgba(30, 41, 59, 0.15);
}

.dm-table tbody tr:hover {
  background: rgba(37, 99, 235, 0.07);
}

.dm-table tr.conflict {
  background: rgba(245, 158, 11, 0.06);
  box-shadow: inset 3px 0 0 var(--warning);
}

.dm-table tr.conflict td:first-child b {
  color: var(--warning);
}

.dm-table small {
  display: block;
  margin-top: 3px;
  color: var(--warning);
}

.dm-table input,
.dm-table select,
.dm-table textarea {
  width: 100%;
  min-width: 180px;
  padding: 7px 9px;
  border: 1px solid var(--border-subdued);
  border-radius: 6px;
  color: var(--foreground-normal);
  background: rgba(15, 23, 42, 0.2);
}

.dm-actions {
  justify-content: flex-end;
  margin-top: 16px;
  border: 0;
}

.dm-action-copy {
  margin-right: auto;
  color: var(--foreground-subdued);
}

.dm-action-buttons {
  display: flex;
  gap: 10px;
}

.dm-muted,
.dm-empty {
  padding: 28px;
  color: var(--foreground-subdued);
}

@media (max-width: 900px) {
  .dm-page {
    grid-template-columns: 1fr;
  }

  .dm-contact-grid {
    grid-template-columns: 1fr;
  }
}
</style>
