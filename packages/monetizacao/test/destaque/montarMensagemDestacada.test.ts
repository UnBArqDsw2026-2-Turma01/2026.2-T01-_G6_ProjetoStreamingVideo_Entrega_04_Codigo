import { usuarioId } from "@g6/shared-kernel";
import { ErroDestaque, montarMensagemDestacada, type OrigemMensagem } from "../../src/destaque";
import { empilharDestaques } from "../../src/destaque/montarMensagemDestacada";

const origem: OrigemMensagem = {
  id: "doacao-1",
  autor: usuarioId("u1"),
  nomeAutor: "Espectador",
  em: new Date("2026-11-15T12:00:00Z"),
};

function montar(valor: number, texto = "Valeu pela live!") {
  return montarMensagemDestacada(valor, texto, origem);
}

describe("montarMensagemDestacada (Client do Decorator)", () => {
  test("devolve o DTO do shared-kernel com os destaques já resolvidos", () => {
    expect(montar(2000)).toEqual({
      id: "doacao-1",
      autor: "u1",
      nomeAutor: "Espectador",
      texto: "Valeu pela live!",
      em: new Date("2026-11-15T12:00:00Z"),
      valor: 2000,
      cor: "LARANJA",
      tempoFixacaoMin: 10,
    });
  });

  test.each([
    [200, "AZUL", 0, 50],
    [500, "VERDE", 2, 150],
    [2000, "LARANJA", 10, 225],
    [5000, "ROSA", 30, 250],
    [50000, "VERMELHO", 300, 350],
  ])("doação de %i usa a faixa certa (SC01, SC02)", (quantidade, cor, fixacao, limite) => {
    const dto = montar(quantidade);
    expect(dto.valor).toBe(quantidade);
    expect(dto.cor).toBe(cor);
    expect(dto.tempoFixacaoMin).toBe(fixacao);

    const pilha = empilharDestaques("Espectador", "Valeu pela live!", quantidade);
    expect(pilha.cabecalho()).toContain(`[${cor}]`);
    expect(pilha.descrever()).toContain(`limite de ${limite} caracteres`);
  });

  test("a FAIXA_1 não recebe a camada de fixação", () => {
    const pilha = empilharDestaques("Espectador", "Valeu pela live!", 200);
    expect(pilha.descrever()).toBe("mensagem → limite de 50 caracteres → cor AZUL");
    expect(pilha.cabecalho()).not.toContain("fixada");
    expect(montar(200).tempoFixacaoMin).toBe(0);
  });

  test("a pilha completa mantém o cabeçalho da E03", () => {
    const pilha = empilharDestaques("Espectador", "Valeu pela live!", 2000);
    expect(pilha.cabecalho()).toBe("[LARANJA] Espectador · 2000 de moeda virtual · fixada por 10 min");
  });

  test("recusa uma mensagem acima do limite da faixa", () => {
    expect(() => montar(200, "a".repeat(80))).toThrow("excede o limite de 50");
    expect(() => montar(200, "a".repeat(80))).toThrow(ErroDestaque);
  });

  test("aceita a mensagem exatamente no limite da faixa", () => {
    expect(montar(200, "a".repeat(50)).texto).toBe("a".repeat(50));
  });

  test("valor abaixo da faixa mínima é recusado", () => {
    expect(() => montar(100)).toThrow(ErroDestaque);
  });

  test("recusa texto vazio ou só com espaços", () => {
    expect(() => montar(200, "")).toThrow(ErroDestaque);
    expect(() => montar(200, "   ")).toThrow(ErroDestaque);
  });

  test("o erro carrega um código e serve como ErroDominio do shared-kernel", () => {
    const codigoDe = (acao: () => unknown) => {
      try {
        acao();
      } catch (erro) {
        if (erro instanceof ErroDestaque) return { codigo: erro.codigo, mensagem: erro.mensagem };
      }
      return undefined;
    };

    expect(codigoDe(() => montar(100))?.codigo).toBe("VALOR_ABAIXO_DO_MINIMO");
    expect(codigoDe(() => montar(200, ""))?.codigo).toBe("MENSAGEM_VAZIA");
    expect(codigoDe(() => montar(200, "a".repeat(51)))?.codigo).toBe("MENSAGEM_ACIMA_DO_LIMITE");
    expect(codigoDe(() => montar(100))?.mensagem).toContain("quantidade mínima");
  });

  test("não altera os dados de origem", () => {
    const copia = { ...origem };
    montar(5000);
    expect(origem).toEqual(copia);
  });
});
