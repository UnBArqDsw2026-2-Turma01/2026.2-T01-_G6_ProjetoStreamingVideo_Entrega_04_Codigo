// Kit de testes: fakes dos ports e suítes de contrato independentes do executor.
// Ponto de entrada público do pacote: exporte aqui só o que outros módulos podem usar.
// Implementação: #4.
// Exportando todos os fakes para uso externo nos testes dos pacotes vizinhos
export * from './fakes/fake-autenticacao';
export * from './fakes/fake-transmissao';
export * from './fakes/fake-recarga';
export * from './fakes/fake-doacao';
export * from './fakes/fake-chat';
export * from './fakes/fake-moderacao';

// As exportações das suites virão pra cá assim que elas forem construídas no diretório 'suites/'
