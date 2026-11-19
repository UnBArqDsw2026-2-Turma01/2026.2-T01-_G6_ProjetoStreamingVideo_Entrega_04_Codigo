export interface TextAnalysisResult {
  isSpam: boolean;
  isToxic: boolean;
  hasExternalLinks: boolean;
  entropy: number;
  toxicityScore: number;
  detectedViolations: string[];
  normalizedText: string;
}

export class TextEntropyAnalyzer {
  private static readonly TOXIC_TERMS = new Set([
    'hack', 'cheat', 'aimbot', 'wallhack', 'doxx', 'doxxing',
    'hate', 'odio', 'racismo', 'discriminacao', 'phishing',
    'free_robux', 'free_bits', 'scam', 'trojan', 'exploit',
    'palavrao', 'ofensa', 'xingamento'
  ]);

  /**
   * Calcula a Entropia de Shannon da mensagem em bits por caractere.
   * Mensagens repetitivas ("aaaaaa" ou "click click click") possuem entropia muito baixa (< 2.0).
   * Mensagens com ruído randômico de bot ("asdf897asdfh2k3jhsad") possuem entropia muito alta (> 4.8).
   */
  public static calculateShannonEntropy(text: string): number {
    if (!text || text.length === 0) return 0;
    const len = text.length;
    const freq: Record<string, number> = {};

    for (const char of text) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    for (const char in freq) {
      const p = freq[char] / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Normaliza texto removendo acentos e convertendo leetspeak para evitar evasão de filtros
   * Exemplo: "h@ck" -> "hack", "d0xx" -> "doxx", "palavrão" -> "palavrao"
   */
  public static normalizeLeetSpeak(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/@/g, 'a')
      .replace(/4/g, 'a')
      .replace(/3/g, 'e')
      .replace(/1/g, 'i')
      .replace(/!/g, 'i')
      .replace(/0/g, 'o')
      .replace(/5/g, 's')
      .replace(/\$/g, 's')
      .replace(/7/g, 't')
      .replace(/[^\w\s]/g, ' ')
      .replace(/[\s\-_.]+/g, ' ')
      .trim();
  }

  public static analyze(message: string): TextAnalysisResult {
    const raw = message.trim();
    const normalized = this.normalizeLeetSpeak(raw);
    const entropy = this.calculateShannonEntropy(raw);
    const violations: string[] = [];

    // 1. Checagem de Repetição de Caracteres (Flood / Spam)
    const hasRepeatedChars = /(.)\1{5,}/i.test(raw);
    if (hasRepeatedChars) {
      violations.push('CHARACTER_FLOODING');
    }

    // 2. Checagem de Entropia Anômala
    if (raw.length > 25 && entropy < 2.2) {
      violations.push('LOW_ENTROPY_REPETITIVE_SPAM');
    } else if (raw.length > 30 && entropy > 4.6 && !raw.includes(' ')) {
      violations.push('HIGH_ENTROPY_RANDOM_HASH_SPAM');
    }

    // 3. Checagem de URLs e Phishing com Regex
    const urlMatches = raw.match(/https?:\/\/[^\s]+/gi) || [];
    const hasExternalLinks = urlMatches.length >= 1;
    if (urlMatches.length >= 2 || /free-?(bits|robux|nitro)\./i.test(raw)) {
      violations.push('SUSPICIOUS_PHISHING_LINK');
    } else if (hasExternalLinks) {
      violations.push('EXTERNAL_LINK_QUARANTINE');
    }

    // 4. Checagem de Toxicidade Léxica
    const words = normalized ? normalized.split(/\s+/) : [];
    let toxicHits = 0;
    for (const word of words) {
      if (this.TOXIC_TERMS.has(word)) {
        toxicHits++;
        violations.push(`TOXIC_TERM_${word.toUpperCase()}`);
      }
    }

    const toxicityScore = Math.min(1.0, toxicHits * 0.45);
    const isSpam = violations.some(
      (v) => v.includes('SPAM') || v.includes('FLOODING') || v.includes('LINK')
    );
    const isToxic = toxicityScore >= 0.4;

    return {
      isSpam,
      isToxic,
      hasExternalLinks,
      entropy: Number(entropy.toFixed(3)),
      toxicityScore: Number(toxicityScore.toFixed(2)),
      detectedViolations: violations,
      normalizedText: normalized
    };
  }
}
