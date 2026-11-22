// Photo attachments for a saved job.
// Photos upload straight away (they are not part of the "Save job" button).
// Each photo is shrunk in the browser first, so phone photos (4-8 MB)
// become ~200 KB: faster to upload and light on the database.
import { api, apiUpload, apiBlobUrl } from "./api.js";
import { escapeHtml, formatDateTime, showToast } from "./utils.js";

const MAX_SIDE = 1280; // longest edge in pixels
const JPEG_QUALITY = 0.8;
const MAX_PHOTOS = 10; // keep in step with the server

// The HTML for the "Photos" card. New (unsaved) jobs get a hint instead,
// because a photo needs a job to belong to.
export function photosSection(job, locked) {
  const body = job
    ? `
      <ul class="photo-grid" id="photo-grid" aria-live="polite"></ul>
      <p class="hint" id="photo-empty" hidden>No photos yet.</p>
      ${
        locked
          ? ""
          : `<div class="photo-actions no-print">
              <label class="btn" for="photo-input">Add photos</label>
              <input id="photo-input" class="visually-hidden" type="file" accept="image/*" multiple />
              <span class="hint" id="photo-status" role="status"></span>
            </div>`
      }
      <dialog id="photo-dialog" class="photo-dialog" aria-label="Photo preview">
        <img id="photo-large" alt="Enlarged photo of the unit" />
        <button type="button" class="btn" id="photo-close">Close</button>
      </dialog>`
    : '<p class="hint no-print">Save the job first, then you can add photos of the unit.</p>';

  return `
    <section class="card" aria-labelledby="h-photos">
      <h2 class="card-title" id="h-photos">Photos</h2>
      ${body}
    </section>`;
}

// Shrinks an image file to a JPEG Blob. Rejects if the browser can't read it.
async function shrinkImage(file) {
  // "from-image" makes the browser apply the phone's rotation info (EXIF).
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("shrink failed"))), "image/jpeg", JPEG_QUALITY)
  );
}

// Makes the Photos card work. Call after the HTML above is on the page.
export function wirePhotos(container, job, locked) {
  if (!job) return;
  const grid = container.querySelector("#photo-grid");
  const emptyMsg = container.querySelector("#photo-empty");
  const input = container.querySelector("#photo-input");
  const status = container.querySelector("#photo-status");
  const dialog = container.querySelector("#photo-dialog");
  const large = container.querySelector("#photo-large");
  let photos = [...(job.photos || [])];
  const urls = new Map(); // photo id -> temporary browser URL of the loaded picture

  async function loadUrl(id) {
    if (!urls.has(id)) urls.set(id, await apiBlobUrl(`/jobs/${job.id}/photos/${id}`));
    return urls.get(id);
  }

  function render() {
    emptyMsg.hidden = photos.length > 0;
    grid.innerHTML = photos
      .map(
        (p, i) => `
        <li class="photo-item" data-id="${p.id}">
          <button type="button" class="photo-thumb" data-open="${p.id}" aria-label="Open photo ${i + 1}">
            <img alt="Photo ${i + 1} of the unit" />
          </button>
          <span class="photo-meta">${escapeHtml(p.uploaded_by)} · ${formatDateTime(p.created_at)}</span>
          ${locked ? "" : `<button type="button" class="btn btn-danger btn-small no-print" data-remove="${p.id}">Remove</button>`}
        </li>`
      )
      .join("");

    // Pictures need the login token, so they are fetched in code and shown
    // from a temporary URL (an <img src> alone cannot send the token).
    for (const p of photos) {
      loadUrl(p.id)
        .then((url) => {
          const img = grid.querySelector(`[data-id="${p.id}"] img`);
          if (img) img.src = url;
        })
        .catch(() => {});
    }
  }

  grid.addEventListener("click", async (e) => {
    const openId = e.target.closest("[data-open]")?.dataset.open;
    if (openId) {
      large.src = await loadUrl(Number(openId));
      dialog.showModal();
      return;
    }
    const removeId = e.target.closest("[data-remove]")?.dataset.remove;
    if (removeId && confirm("Remove this photo permanently?")) {
      try {
        await api(`/jobs/${job.id}/photos/${removeId}`, { method: "DELETE" });
        photos = photos.filter((p) => p.id !== Number(removeId));
        render();
        showToast("Photo removed.");
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  container.querySelector("#photo-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close(); // click on the dark backdrop
  });

  input?.addEventListener("change", async () => {
    const files = [...input.files];
    input.value = ""; // lets the same photo be chosen again later
    let added = 0;
    for (const [i, file] of files.entries()) {
      if (photos.length >= MAX_PHOTOS) {
        status.textContent = `Limit reached: at most ${MAX_PHOTOS} photos per job.`;
        break;
      }
      status.textContent = `Uploading ${i + 1} of ${files.length}…`;
      try {
        const blob = await shrinkImage(file);
        const { id } = await apiUpload(`/jobs/${job.id}/photos`, blob);
        photos.push({ id, uploaded_by: "You", created_at: new Date().toISOString().slice(0, 19).replace("T", " ") });
        added++;
        render();
      } catch (err) {
        status.textContent = `Could not add ${file.name}: ${err.message}`;
        return;
      }
    }
    if (added) {
      status.textContent = "";
      showToast(added === 1 ? "Photo added." : `${added} photos added.`);
    }
  });

  render();
}
