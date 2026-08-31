// Função de servidor (Vercel) — lê a foto do cupom e extrai os dados.
// A chave fica em process.env.ANTHROPIC_API_KEY (Environment Variable da Vercel).
// Caminho no repositório: api/ocr.js  →  endpoint: /api/ocr
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { image, media_type } = (req.body || {});
    if (!image) { res.status(400).json({ error: 'Imagem ausente.' }); return; }
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) { res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' }); return; }

    const prompt = [
      'Você lê cupons e notas fiscais brasileiras. Extraia os dados da imagem e responda',
      'APENAS com um JSON válido, sem nenhum texto antes ou depois, no formato exato:',
      '{"valor": number|null, "fornecedor": string|null, "data": "AAAA-MM-DD"|null, "categoria": string|null}',
      '- valor: valor TOTAL pago (número com ponto decimal, ex.: 149.90).',
      '- fornecedor: nome do estabelecimento.',
      '- data: data da compra no formato AAAA-MM-DD.',
      '- categoria: uma palavra (ex.: Combustível, Alimentação, Material, Equipamento, Serviço, Outro).',
      'Se algum campo não estiver legível, use null.'
    ].join('\n');

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
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image } },
            { type: 'text', text: prompt }
          ]
        }]
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
