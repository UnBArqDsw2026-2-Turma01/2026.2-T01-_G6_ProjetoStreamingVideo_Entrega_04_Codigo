// Módulo fora de `packages/` usado pela violação proposital (#18). Não viola nada
// sozinho: o erro está em quem o importa, porque ele serviria de ponte entre contextos.
export const ponte = 'fora de packages/';
