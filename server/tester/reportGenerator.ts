import { AuditBlock } from '../validation/logger.js';

export interface TradeSimulation {
  time: string;
  symbol: string;
  price: number;
  action: 'BUY' | 'SELL';
  dataHash: string;
  source: string;
  verified: boolean;
}

export function generateMarkdownAuditReport(
  trades: TradeSimulation[],
  auditChain: AuditBlock[]
): string {
  const totalProcessed = auditChain.length - 1; // minus genesis
  const approvedCount = auditChain.filter((b) => b.entry.status === 'APPROVED').length;
  const rejectedBlocks = auditChain.filter((b) => b.entry.status === 'REJECTED');
  const rejectedCount = rejectedBlocks.length;

  const rejectionReasons: Record<string, number> = {};
  rejectedBlocks.forEach((b) => {
    const reason = b.entry.reason || 'unknown';
    rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
  });

  const nowIso = new Date().toISOString();
  const startTimeIso = auditChain.length > 0 ? auditChain[0].timestamp : nowIso;

  let md = `# Relatório de Auditoria Criptográfica - Mode Demo Auditado Real\n\n`;
  md += `**Gerado em:** ${nowIso}\n`;
  md += `**Hash Head da Cadeia:** \`${auditChain.length > 0 ? auditChain[auditChain.length - 1].current_hash : 'N/A'}\` \n\n`;

  md += `## 1. Resumo da Sessão de Validação\n`;
  md += `- **Período de Execução:** ${startTimeIso} até ${nowIso}\n`;
  md += `- **Sinais de Mercado Ingeridos & Assinados:** ${totalProcessed}\n`;
  md += `- **Aprovados pelo DataVerifier:** ${approvedCount} (${((approvedCount / (totalProcessed || 1)) * 100).toFixed(1)}%)\n`;
  md += `- **Rejeitados por Violação:** ${rejectedCount}\n`;

  if (rejectedCount > 0) {
    md += `\n### Detalhamento de Rejeições por Causa:\n`;
    Object.entries(rejectionReasons).forEach(([reason, count]) => {
      md += `- \`${reason}\`: ${count} ocorrência(s)\n`;
    });
  }

  md += `\n## 2. Operações Simuladas com Dados 100% Autenticados\n`;
  if (trades.length === 0) {
    md += `*Nenhuma operação simulada registrada nesta janela.*\n`;
  } else {
    md += `| Timestamp | Provedor | Símbolo | Ação | Preço (R$/$) | Hash SHA-256 do Dado |\n`;
    md += `|---|---|---|---|---|---|\n`;
    trades.forEach((t) => {
      md += `| ${t.time} | ${t.source} | ${t.symbol} | **${t.action}** | ${t.price.toFixed(2)} | \`${t.dataHash.substring(0, 16)}...\` |\n`;
    });
  }

  md += `\n## 3. Trilha de Auditoria Imutável (Cadeia de Hashes SHA-256)\n`;
  md += `*Garantia matemática de imutabilidade: cada bloco encadeia o hash da entrada anterior.*\n\n`;

  const recentBlocks = auditChain.slice(-5);
  recentBlocks.forEach((b) => {
    md += `### Bloco #${b.blockNumber} [${b.entry.status}]\n`;
    md += `- **Timestamp:** ${b.timestamp}\n`;
    md += `- **Provedor:** ${b.entry.source}\n`;
    md += `- **Símbolo:** ${b.entry.payload.symbol || 'N/A'}\n`;
    md += `- **Prev Hash:** \`${b.prev_hash}\` \n`;
    md += `- **Current Hash:** \`${b.current_hash}\` \n`;
    if (b.entry.reason) {
      md += `- **Motivo de Rejeição:** \`${b.entry.reason}\` \n`;
    }
    md += `\n`;
  });

  md += `---\n*Documento gerado automaticamente pela Arquitetura de Validação e Autenticação de Dados para Trading Bot.*`;

  return md;
}
