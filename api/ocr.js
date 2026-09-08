// Função de servidor (Vercel) — lê cupom/NF (imagem ou PDF) e extrai os dados.
// Chave em process.env.ANTHROPIC_API_KEY. Caminho no repositório: api/ocr.js → endpoint /api/ocr
export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { image, media_type, pdf } = (req.body || {});
    if (!image && !pdf) { res.status(400).json({ error: 'Arquivo ausente.' }); return; }
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) { res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' }); return; }

    const prompt = [
      'Você lê cupons fiscais e notas fiscais brasileiras (inclusive NF-e de compras online). Extraia os dados e responda',
      'APENAS com um JSON válido, sem nenhum texto antes ou depois, no formato exato:',
      '{"valor": number|null, "fornecedor": string|null, "data": "AAAA-MM-DD"|null, "categoria": string|null}',
      '- valor: valor TOTAL da nota/compra (número com ponto decimal, ex.: 149.90).',
      '- fornecedor: nome do estabelecimento/loja/emitente.',
      '- data: data da compra/emissão no formato AAAA-MM-DD.',
      '- categoria: uma palavra (ex.: Combustível, Alimentação, Material, Equipamento, Serviço, Outro).',
      'Se algum campo não estiver legível, use null.'
    ].join('\n');

    const conteudo = pdf
      ? [ { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
          { type: 'text', text: prompt } ]
      : [ { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image } },
          { type: 'text', text: prompt } ];

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: conteudo }]
      })
    });

    const data = await r.json();
    if (!r.ok) { res.status(502).json({ error: 'Falha na API da Anthropic', detail: data }); return; }

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed = null;
    try { parsed = JSON.parse(clean); } catch (e) { parsed = null; }
    res.status(200).json({ parsed, raw: parsed ? undefined : text });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
