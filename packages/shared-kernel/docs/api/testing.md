# testing

## Classes

### FakeAutenticacao

Autenticação de usuários.

- **Provê:** `@g6/identidade` (Chain of Responsibility da E03).
- **Consome:** `apps/*`.
- **Garante:** uma `Sessao` só existe depois de a cadeia inteira aprovar o login;
  credencial errada, conta bloqueada e segundo fator ausente voltam como erro,
  nunca como exceção.

#### Implements

- [`AutenticacaoPort`](index.md#autenticacaoport)

#### Constructors

##### Constructor

> **new FakeAutenticacao**(): [`FakeAutenticacao`](#fakeautenticacao)

###### Returns

[`FakeAutenticacao`](#fakeautenticacao)

#### Properties

##### chamadas

> `readonly` **chamadas**: [`ChamadaAutenticacao`](#chamadaautenticacao)[] = `[]`

##### proximoResultadoLogin?

> `optional` **proximoResultadoLogin?**: [`Resultado`](index.md#resultado)\<[`Sessao`](index.md#sessao)\>

##### proximoResultadoStepUp?

> `optional` **proximoResultadoStepUp?**: [`Resultado`](index.md#resultado)\<[`Sessao`](index.md#sessao)\>

#### Methods

##### login()

> **login**(`credenciais`): `Promise`\<[`Resultado`](index.md#resultado)\<[`Sessao`](index.md#sessao)\>\>

Autentica e emite a sessão.

###### Parameters

###### credenciais

[`Credenciais`](index.md#credenciais)

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<[`Sessao`](index.md#sessao)\>\>

###### Implementation of

[`AutenticacaoPort`](index.md#autenticacaoport).[`login`](index.md#login)

##### stepUp()

> **stepUp**(`sessao`, `fator`): `Promise`\<[`Resultado`](index.md#resultado)\<[`Sessao`](index.md#sessao)\>\>

Reautentica antes de uma ação sensível e devolve a sessão elevada.
A sessão original não é alterada.

###### Parameters

###### sessao

[`Sessao`](index.md#sessao)

###### fator

[`FatorAdicional`](index.md#fatoradicional)

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<[`Sessao`](index.md#sessao)\>\>

###### Implementation of

[`AutenticacaoPort`](index.md#autenticacaoport).[`stepUp`](index.md#stepup)

***

### FakeChat

Chat em tempo real de uma live.

- **Provê:** `@g6/chat` (Observer do `ChatRoom`).
- **Consome:** `@g6/monetizacao` (o Mediator da doação publica a mensagem destacada) e `apps/*`.
- **Garante:** toda mensagem passa pelo `ModeracaoPort` antes da entrega; só a aprovada
  chega aos ouvintes, na ordem de publicação, e gera `MensagemPublicada`.
  Mensagem em quarentena ou bloqueada volta como erro para quem publicou.

#### Implements

- [`ChatPort`](index.md#chatport)

#### Constructors

##### Constructor

> **new FakeChat**(): [`FakeChat`](#fakechat)

###### Returns

[`FakeChat`](#fakechat)

#### Properties

##### chamadas

> `readonly` **chamadas**: [`ChamadaChat`](#chamadachat)[] = `[]`

##### ouvintes

> `readonly` **ouvintes**: `Map`\<`string`, ((`m`) => `void`)[]\>

#### Methods

##### inscrever()

> **inscrever**(`live`, `ouvinte`): [`Cancelamento`](index.md#cancelamento)

Passa a receber as mensagens entregues na live a partir de agora; não reenvia histórico.

###### Parameters

###### live

[`LiveId`](index.md#liveid)

###### ouvinte

(`mensagem`) => `void`

###### Returns

[`Cancelamento`](index.md#cancelamento)

###### Implementation of

[`ChatPort`](index.md#chatport).[`inscrever`](index.md#inscrever)

##### publicar()

> **publicar**(`live`, `mensagem`): `Promise`\<[`Resultado`](index.md#resultado)\<`void`\>\>

###### Parameters

###### live

[`LiveId`](index.md#liveid)

###### mensagem

[`MensagemChat`](index.md#mensagemchat)

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<`void`\>\>

###### Implementation of

[`ChatPort`](index.md#chatport).[`publicar`](index.md#publicar-1)

##### publicarDestacada()

> **publicarDestacada**(`live`, `mensagem`): `Promise`\<[`Resultado`](index.md#resultado)\<`void`\>\>

###### Parameters

###### live

[`LiveId`](index.md#liveid)

###### mensagem

[`MensagemDestacada`](index.md#mensagemdestacada)

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<`void`\>\>

###### Implementation of

[`ChatPort`](index.md#chatport).[`publicarDestacada`](index.md#publicardestacada)

***

### FakeDoacao

Doação a uma live, com ou sem mensagem destacada.

- **Provê:** `@g6/monetizacao` (Facade + Mediator).
- **Consome:** `apps/*`.
- **Garante:** a doação é sempre para uma live no ar; o criador que recebe o repasse vem de
  `TransmissaoPort.consultar`. Live inexistente ou encerrada, saldo insuficiente e doação
  à própria live voltam como erro, sem débito.
  Com a doação concluída, publica `DoacaoConfirmada`. **Falha no chat não desfaz a doação**
  (E03, Ata S2_02, D05): o resultado continua `ok`, com `destaqueEntregue: false`.

#### Implements

- [`DoacaoPort`](index.md#doacaoport)

#### Constructors

##### Constructor

> **new FakeDoacao**(): [`FakeDoacao`](#fakedoacao)

###### Returns

[`FakeDoacao`](#fakedoacao)

#### Properties

##### chamadas

> `readonly` **chamadas**: [`ChamadaDoacao`](#chamadadoacao)[] = `[]`

##### proximoResultado?

> `optional` **proximoResultado?**: [`Resultado`](index.md#resultado)\<[`ComprovanteDoacao`](index.md#comprovantedoacao)\>

#### Methods

##### doar()

> **doar**(`sessao`, `live`, `valor`, `mensagem?`): `Promise`\<[`Resultado`](index.md#resultado)\<[`ComprovanteDoacao`](index.md#comprovantedoacao)\>\>

Com `mensagem`, a doação vira mensagem destacada e é entregue pelo `ChatPort`.

###### Parameters

###### sessao

[`Sessao`](index.md#sessao)

###### live

[`LiveId`](index.md#liveid)

###### valor

`number`

###### mensagem?

`string`

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<[`ComprovanteDoacao`](index.md#comprovantedoacao)\>\>

###### Implementation of

[`DoacaoPort`](index.md#doacaoport).[`doar`](index.md#doar)

***

### FakeModeracao

Moderação automática de mensagens.

- **Provê:** `@g6/moderacao` (AutoMod + Strategy da E03).
- **Consome:** `@g6/chat`.
- **Garante:** sempre responde com um veredito; não entrega, não guarda e não altera
  a mensagem. O que fazer com cada decisão é responsabilidade do chat.

#### Implements

- [`ModeracaoPort`](index.md#moderacaoport)

#### Constructors

##### Constructor

> **new FakeModeracao**(): [`FakeModeracao`](#fakemoderacao)

###### Returns

[`FakeModeracao`](#fakemoderacao)

#### Properties

##### chamadas

> `readonly` **chamadas**: [`ChamadaModeracao`](#chamadamoderacao)[] = `[]`

##### proximoVeredito?

> `optional` **proximoVeredito?**: [`VereditoModeracao`](index.md#vereditomoderacao)

#### Methods

##### avaliar()

> **avaliar**(`mensagem`): `Promise`\<[`VereditoModeracao`](index.md#vereditomoderacao)\>

Aceita também `MensagemDestacada`, que é uma `MensagemChat`.

###### Parameters

###### mensagem

[`MensagemChat`](index.md#mensagemchat)

###### Returns

`Promise`\<[`VereditoModeracao`](index.md#vereditomoderacao)\>

###### Implementation of

[`ModeracaoPort`](index.md#moderacaoport).[`avaliar`](index.md#avaliar)

***

### FakeRecarga

Compra de moeda virtual.

- **Provê:** `@g6/monetizacao` (Decorator no preço, Adapter no gateway, Proxy na confirmação).
- **Consome:** `apps/*`.
- **Garante:** a recarga tem dois tempos. `recarregar` só cria o checkout e **não credita**;
  a moeda entra na carteira depois, quando um aviso de pagamento autêntico passa pelo Proxy,
  e só então `consultar` devolve `concluida` e o evento `RecargaConcluida` é publicado,
  uma vez por recarga. Pagamento recusado não aparece em `recarregar` nem cancela a recarga:
  ela continua `pendente`, e o espectador pode tentar de novo no mesmo checkout (E02).

O recebimento do aviso (webhook) fica fora do contrato: formato e assinatura são de cada
processador, então pertencem à monetização, e `apps/*` só ligam a rota a ela.

#### Implements

- [`RecargaPort`](index.md#recargaport)

#### Constructors

##### Constructor

> **new FakeRecarga**(): [`FakeRecarga`](#fakerecarga)

###### Returns

[`FakeRecarga`](#fakerecarga)

#### Properties

##### chamadas

> `readonly` **chamadas**: [`ChamadaRecarga`](#chamadarecarga)[] = `[]`

##### ofertasDisponiveis

> **ofertasDisponiveis**: [`OfertaRecarga`](index.md#ofertarecarga)[]

##### proximoResultadoRecarregar?

> `optional` **proximoResultadoRecarregar?**: [`Resultado`](index.md#resultado)\<[`CheckoutPendente`](index.md#checkoutpendente), [`ErroRecarga`](index.md#errorecarga)\>

##### recargas

> `readonly` **recargas**: `Map`\<`string`, `RegistroRecarga`\>

#### Methods

##### confirmar()

> **confirmar**(`recargaId`): `void`

###### Parameters

###### recargaId

`string`

###### Returns

`void`

##### consultar()

> **consultar**(`sessao`, `recargaId`): `Promise`\<[`Resultado`](index.md#resultado)\<[`SituacaoRecarga`](index.md#situacaorecarga)\>\>

Situação de uma recarga da própria sessão. Recarga inexistente ou de outro usuário é erro.

###### Parameters

###### sessao

[`Sessao`](index.md#sessao)

###### recargaId

`string`

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<[`SituacaoRecarga`](index.md#situacaorecarga)\>\>

###### Implementation of

[`RecargaPort`](index.md#recargaport).[`consultar`](index.md#consultar)

##### ofertas()

> **ofertas**(`sessao`): `Promise`\<[`Resultado`](index.md#resultado)\<[`OfertaRecarga`](index.md#ofertarecarga)[]\>\>

Pacotes à venda com preço riscado e promocional, para o modal de recarga.

###### Parameters

###### sessao

[`Sessao`](index.md#sessao)

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<[`OfertaRecarga`](index.md#ofertarecarga)[]\>\>

###### Implementation of

[`RecargaPort`](index.md#recargaport).[`ofertas`](index.md#ofertas)

##### recarregar()

> **recarregar**(`sessao`, `pacote`, `meio`): `Promise`\<[`Resultado`](index.md#resultado)\<[`CheckoutPendente`](index.md#checkoutpendente), [`ErroRecarga`](index.md#errorecarga)\>\>

Cria a recarga e o checkout no meio escolhido. Se ele estiver indisponível e sobrar um
único outro, segue nesse (ver `CheckoutPendente.meio`); se sobrarem vários, devolve
`MEIO_INDISPONIVEL` com as alternativas.

###### Parameters

###### sessao

[`Sessao`](index.md#sessao)

###### pacote

[`PacoteId`](index.md#pacoteid)

###### meio

[`MeioPagamento`](index.md#meiopagamento)

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<[`CheckoutPendente`](index.md#checkoutpendente), [`ErroRecarga`](index.md#errorecarga)\>\>

###### Implementation of

[`RecargaPort`](index.md#recargaport).[`recarregar`](index.md#recarregar)

***

### FakeTransmissao

Ciclo de vida da live.

- **Provê:** `@g6/transmissao` (Builder + Director na configuração, Observer no canal).
- **Consome:** `apps/*` e `@g6/monetizacao` (a doação consulta quem é o criador da live).
- **Garante:** só sessão com papel `criador` abre live; abrir publica `LiveIniciada`
  e encerrar publica `LiveEncerrada` no `EventBus`, uma vez cada. É a única fonte
  de "esta live é de tal criador": nenhum outro módulo guarda essa relação.

#### Implements

- [`TransmissaoPort`](index.md#transmissaoport)

#### Constructors

##### Constructor

> **new FakeTransmissao**(): [`FakeTransmissao`](#faketransmissao)

###### Returns

[`FakeTransmissao`](#faketransmissao)

#### Properties

##### chamadas

> `readonly` **chamadas**: [`ChamadaTransmissao`](#chamadatransmissao)[] = `[]`

##### livesAbertas

> `readonly` **livesAbertas**: `Map`\<`string`, [`LiveResumo`](index.md#liveresumo)\>

#### Methods

##### abrir()

> **abrir**(`criador`, `preset`): `Promise`\<[`Resultado`](index.md#resultado)\<[`LiveResumo`](index.md#liveresumo)\>\>

Monta a configuração pelo preset e coloca a live no ar.

###### Parameters

###### criador

[`Sessao`](index.md#sessao)

###### preset

[`PresetTransmissao`](index.md#presettransmissao)

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<[`LiveResumo`](index.md#liveresumo)\>\>

###### Implementation of

[`TransmissaoPort`](index.md#transmissaoport).[`abrir`](index.md#abrir)

##### consultar()

> **consultar**(`live`): `Promise`\<[`Resultado`](index.md#resultado)\<[`LiveResumo`](index.md#liveresumo)\>\>

Dados de uma live no ar. Live inexistente ou já encerrada volta como erro.

###### Parameters

###### live

[`LiveId`](index.md#liveid)

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<[`LiveResumo`](index.md#liveresumo)\>\>

###### Implementation of

[`TransmissaoPort`](index.md#transmissaoport).[`consultar`](index.md#consultar-1)

##### encerrar()

> **encerrar**(`criador`, `live`): `Promise`\<[`Resultado`](index.md#resultado)\<`void`\>\>

Encerra a live. Só o criador que a abriu pode encerrar.

###### Parameters

###### criador

[`Sessao`](index.md#sessao)

###### live

[`LiveId`](index.md#liveid)

###### Returns

`Promise`\<[`Resultado`](index.md#resultado)\<`void`\>\>

###### Implementation of

[`TransmissaoPort`](index.md#transmissaoport).[`encerrar`](index.md#encerrar)

## Interfaces

### ChamadaAutenticacao

#### Properties

##### args

> **args**: \[[`Credenciais`](index.md#credenciais)\] \| \[[`Sessao`](index.md#sessao), [`FatorAdicional`](index.md#fatoradicional)\]

##### em

> **em**: `Date`

##### metodo

> **metodo**: `"login"` \| `"stepUp"`

***

### ChamadaChat

#### Properties

##### args

> **args**: \[[`LiveId`](index.md#liveid), [`MensagemChat`](index.md#mensagemchat)\] \| \[[`LiveId`](index.md#liveid), [`MensagemDestacada`](index.md#mensagemdestacada)\] \| \[[`LiveId`](index.md#liveid), (`mensagem`) => `void`\]

##### em

> **em**: `Date`

##### metodo

> **metodo**: `"publicar"` \| `"publicarDestacada"` \| `"inscrever"`

***

### ChamadaDoacao

#### Properties

##### args

> **args**: \[[`Sessao`](index.md#sessao), [`LiveId`](index.md#liveid), `number`, `string` \| `undefined`\]

##### em

> **em**: `Date`

##### metodo

> **metodo**: `"doar"`

***

### ChamadaModeracao

#### Properties

##### args

> **args**: \[[`MensagemChat`](index.md#mensagemchat)\]

##### em

> **em**: `Date`

##### metodo

> **metodo**: `"avaliar"`

***

### ChamadaRecarga

#### Properties

##### args

> **args**: \[[`Sessao`](index.md#sessao)\] \| \[[`Sessao`](index.md#sessao), [`PacoteId`](index.md#pacoteid), [`MeioPagamento`](index.md#meiopagamento)\] \| \[[`Sessao`](index.md#sessao), `string`\]

##### em

> **em**: `Date`

##### metodo

> **metodo**: `"consultar"` \| `"ofertas"` \| `"recarregar"`

***

### ChamadaTransmissao

#### Properties

##### args

> **args**: \[[`Sessao`](index.md#sessao), [`PresetTransmissao`](index.md#presettransmissao)\] \| \[[`Sessao`](index.md#sessao), [`LiveId`](index.md#liveid)\] \| \[[`LiveId`](index.md#liveid)\]

##### em

> **em**: `Date`

##### metodo

> **metodo**: `"abrir"` \| `"encerrar"` \| `"consultar"`

## Functions

### casosAutenticacaoPort()

> **casosAutenticacaoPort**(`criarSut`): `object`[]

#### Parameters

##### criarSut

() => [`AutenticacaoPort`](index.md#autenticacaoport)

#### Returns

`object`[]

***

### casosChatPort()

> **casosChatPort**(`criarSut`): `object`[]

#### Parameters

##### criarSut

() => [`ChatPort`](index.md#chatport)

#### Returns

`object`[]

***

### casosDoacaoPort()

> **casosDoacaoPort**(`criarSut`): `object`[]

#### Parameters

##### criarSut

() => [`DoacaoPort`](index.md#doacaoport)

#### Returns

`object`[]

***

### casosEventBus()

> **casosEventBus**(`criarSut`): `object`[]

#### Parameters

##### criarSut

() => [`EventBus`](index.md#eventbus)

#### Returns

`object`[]

***

### casosModeracaoPort()

> **casosModeracaoPort**(`criarSut`): `object`[]

#### Parameters

##### criarSut

() => [`ModeracaoPort`](index.md#moderacaoport)

#### Returns

`object`[]

***

### casosRecargaPort()

> **casosRecargaPort**(`criarSut`, `confirmarPagamento?`): `object`[]

#### Parameters

##### criarSut

() => [`RecargaPort`](index.md#recargaport)

##### confirmarPagamento?

(`recargaId`) => `void` \| `Promise`\<`void`\>

#### Returns

`object`[]

***

### casosTransmissaoPort()

> **casosTransmissaoPort**(`criarSut`): `object`[]

#### Parameters

##### criarSut

() => [`TransmissaoPort`](index.md#transmissaoport)

#### Returns

`object`[]
