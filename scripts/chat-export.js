import { formatDuration } from "./model.js";

export function buildSpotlightChatTable({ title, totalMs, entries, labels }) {
  const normalizedTotalMs = Math.max(0, Number(totalMs) || 0);
  const sortedEntries = [...entries].sort((left, right) => right.elapsedMs - left.elapsedMs);
  const totalTurns = sortedEntries.reduce((total, entry) => total + normalizeTurns(entry.turns), 0);
  const rows = sortedEntries.map((entry) => {
    const elapsedMs = Math.max(0, Number(entry.elapsedMs) || 0);
    const share = normalizedTotalMs > 0 ? ((elapsedMs / normalizedTotalMs) * 100).toFixed(1) : "0.0";
    return [
      "<tr>",
      `<th scope="row">${escapeHtml(entry.name)}</th>`,
      `<td>${formatDuration(elapsedMs)}</td>`,
      `<td>${share}%</td>`,
      `<td>${normalizeTurns(entry.turns)}</td>`,
      "</tr>"
    ].join("");
  }).join("");
  const totalShare = normalizedTotalMs > 0 ? "100.0%" : "0.0%";

  return [
    '<section class="spotlight-tracker-chat">',
    `<h3>${escapeHtml(title)}</h3>`,
    "<table>",
    '<colgroup><col class="spotlight-chat-character"><col class="spotlight-chat-time"><col class="spotlight-chat-share"><col class="spotlight-chat-turns"></colgroup>',
    "<thead><tr>",
    `<th scope="col">${escapeHtml(labels.character)}</th>`,
    `<th scope="col">${escapeHtml(labels.time)}</th>`,
    `<th scope="col">${escapeHtml(labels.share)}</th>`,
    `<th scope="col">${escapeHtml(labels.activations)}</th>`,
    "</tr></thead>",
    `<tbody>${rows}</tbody>`,
    "<tfoot><tr>",
    `<th scope="row">${escapeHtml(labels.total)}</th>`,
    `<td>${formatDuration(normalizedTotalMs)}</td>`,
    `<td>${totalShare}</td>`,
    `<td>${totalTurns}</td>`,
    "</tr></tfoot>",
    "</table>",
    "</section>"
  ].join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeTurns(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}
