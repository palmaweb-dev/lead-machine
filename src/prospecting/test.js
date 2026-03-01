import 'dotenv/config';
import { MapsScraper } from './mapsScraper.js';

const SEGMENTO = process.argv[2] || 'clínica médica';
const CIDADE   = process.argv[3] || 'São Paulo';
const LIMITE   = parseInt(process.argv[4]) || 3;

console.log('\n🧪 TESTE DO SCRAPER\n');
console.log(`Buscando: ${SEGMENTO} em ${CIDADE} (${LIMITE} resultados)\n`);

const scraper = new MapsScraper();
await scraper.init();

const empresas = await scraper.buscarEmpresas(SEGMENTO, CIDADE, LIMITE);

console.log('\n' + '═'.repeat(55));
empresas.forEach((e, i) => {
  console.log(`\n[${i+1}] ${e.nome_empresa}`);
  console.log(`  📞 Telefone: ${e.telefone || '—'}`);
  console.log(`  💬 WhatsApp: ${e.whatsapp || '—'}`);
  console.log(`  🌐 Site:     ${e.site || '—'}`);
  console.log(`  📍 Endereço: ${e.endereco || '—'}`);
  console.log(`  ⭐ Rating:   ${e.avaliacoes || '—'}`);
});

console.log('\n✅ Teste finalizado!\n');
await scraper.fechar();
process.exit(0);
