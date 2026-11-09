/** Jest + SWC, como no código da SubEquipe_02 na Entrega 03. */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: { '^.+\\.(t|j)sx?$': '@swc/jest' },
  // Pacotes @g6/* são TypeScript-fonte: precisam ser transformados mesmo vindo de node_modules.
  transformIgnorePatterns: ['/node_modules/(?!@g6/)'],
};
