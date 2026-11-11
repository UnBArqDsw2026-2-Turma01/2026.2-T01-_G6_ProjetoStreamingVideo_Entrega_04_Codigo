// Kit de testes: fakes dos ports e suítes de contrato independentes do executor.
// Ponto de entrada público do pacote: exporte aqui só o que outros módulos podem usar.
// Implementação: #4.
// Exportando todos os fakes para uso externo nos testes dos pacotes vizinhos
// Fakes dos ports
export * from './fakes/fake-autenticacao';
export * from './fakes/fake-transmissao';
export * from './fakes/fake-recarga';
export * from './fakes/fake-doacao';
export * from './fakes/fake-chat';
export * from './fakes/fake-moderacao';

// Suítes de contrato
export * from './suites/event-bus.suite';
export * from './suites/transmissao.suite';
export * from './suites/autenticacao.suite';
export * from './suites/recarga.suite';
export * from './suites/doacao.suite';
export * from './suites/chat.suite';
export * from './suites/moderacao.suite';