import { test } from 'node:test';
import { 
  FakeAutenticacao, casosAutenticacaoPort,
  FakeTransmissao, casosTransmissaoPort,
  FakeRecarga, casosRecargaPort,
  FakeDoacao, casosDoacaoPort,
  FakeChat, casosChatPort,
  FakeModeracao, casosModeracaoPort
} from '../src/testing';

const casosAuth = casosAutenticacaoPort(() => new FakeAutenticacao());
for (const caso of casosAuth) { test(`Contrato AutenticacaoPort: ${caso.nome}`, caso.executar); }

const casosTransmissao = casosTransmissaoPort(() => new FakeTransmissao());
for (const caso of casosTransmissao) { test(`Contrato TransmissaoPort: ${caso.nome}`, caso.executar); }

const casosRecarga = casosRecargaPort(() => new FakeRecarga());
for (const caso of casosRecarga) { test(`Contrato RecargaPort: ${caso.nome}`, caso.executar); }

const casosDoacao = casosDoacaoPort(() => new FakeDoacao());
for (const caso of casosDoacao) { test(`Contrato DoacaoPort: ${caso.nome}`, caso.executar); }

const casosChat = casosChatPort(() => new FakeChat());
for (const caso of casosChat) { test(`Contrato ChatPort: ${caso.nome}`, caso.executar); }

const casosModeracao = casosModeracaoPort(() => new FakeModeracao());
for (const caso of casosModeracao) { test(`Contrato ModeracaoPort: ${caso.nome}`, caso.executar); }