// Função de servidor (Vercel) — cria a pasta do cliente e sobe o documento no Google Drive.
// Caminho no repositório: api/drive.js  →  endpoint: /api/drive
// Variáveis de ambiente necessárias (Vercel > Settings > Environment Variables):
//   GOOGLE_SA_JSON            = conteúdo inteiro do arquivo .json da conta de serviço
//   DRIVE_CLIENTES_FOLDER_ID  = ID da pasta "Clientes" no Drive
import { google } from 'googleapis';
import { Readable } from 'stream';

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

function driveClient() {
  const creds = JSON.parse(process.env.GOOGLE_SA_JSON);
  const auth = new google.auth.JWT(
    creds.client_email, null, creds.private_key,
    ['https://www.googleapis.com/auth/drive']
  );
  return google.drive({ version: 'v3', auth });
}

async function acharOuCriarPasta(drive, nome, paiId) {
  const safe = nome.replace(/'/g, "\\'");
  const q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${paiId}' in parents and trashed=false`;
  const r = await drive.files.list({ q, fields: 'files(id,name)', supportsAllDrives: true, includeItemsFromAllDrives: true });
  if (r.data.files && r.data.files.length) return r.data.files[0].id;
  const c = await drive.files.create({
    requestBody: { name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [paiId] },
    fields: 'id', supportsAllDrives: true
  });
  return c.data.id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    if (!process.env.GOOGLE_SA_JSON) { res.status(500).json({ error: 'GOOGLE_SA_JSON não configurada.' }); return; }
    const raiz = process.env.DRIVE_CLIENTES_FOLDER_ID;
    if (!raiz) { res.status(500).json({ error: 'DRIVE_CLIENTES_FOLDER_ID não configurada.' }); return; }

    const { pastaCliente, nomeArquivo, fileBase64, mimeType } = (req.body || {});
    if (!pastaCliente || !nomeArquivo || !fileBase64) { res.status(400).json({ error: 'Dados incompletos.' }); return; }

    const drive = driveClient();
    const pastaId = await acharOuCriarPasta(drive, pastaCliente, raiz);

    const buffer = Buffer.from(fileBase64, 'base64');
    const created = await drive.files.create({
      requestBody: { name: nomeArquivo, parents: [pastaId] },
      media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buffer) },
      fields: 'id, webViewLink', supportsAllDrives: true
    });

    res.status(200).json({ fileId: created.data.id, link: created.data.webViewLink, pastaId });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
