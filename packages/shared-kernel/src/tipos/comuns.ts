/**
 * Quantidade de moeda virtual da plataforma.
 * Sempre inteiro positivo ou zero, em unidades da moeda (nunca em reais).
 */
export type MoedaVirtual = number;

/**
 * Falha de regra de negócio, devolvida em `Resultado` em vez de lançada.
 * `codigo` é estável e serve para decisão em código; `mensagem` é para exibição.
 */
export interface ErroDominio {
  readonly codigo: string;
  readonly mensagem: string;
}

/**
 * Retorno dos ports: sucesso com valor ou falha com erro, sem exceção cruzando
 * a fronteira entre pacotes. Exceção fica reservada a defeito de programação.
 */
export type Resultado<T, E = ErroDominio> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly erro: E };

/** Desfaz uma inscrição (`ChatPort.inscrever`, `EventBus.assinar`). Chamar duas vezes não tem efeito. */
export type Cancelamento = () => void;
