# index

## Classes

### EventBusEmMemoria

Implementação em memória do barramento de eventos de domínio.

- **Garante:** entrega síncrona, em ordem de inscrição, com proteção contra
  reentrância (fila de despacho para eventos publicados durante o tratamento de outro).
- **Falhas:** um tratador que lança não impede a entrega aos demais nem trava a fila;
  ao fim do despacho, as falhas voltam juntas ao publicador como `AggregateError`.

#### Implements

- [`EventBus`](#eventbus)

#### Constructors

##### Constructor

> **new EventBusEmMemoria**(): [`EventBusEmMemoria`](#eventbusemmemoria)

###### Returns

[`EventBusEmMemoria`](#eventbusemmemoria)

#### Methods

##### assinar()

> **assinar**\<`T`\>(`tipo`, `tratador`): [`Cancelamento`](#cancelamento)

###### Type Parameters

###### T

`T` *extends* `"LiveIniciada"` \| `"LiveEncerrada"` \| `"RecargaConcluida"` \| `"DoacaoConfirmada"` \| `"MensagemPublicada"`

###### Parameters

###### tipo

`T`

###### tratador

(`evento`) => `void`

###### Returns

[`Cancelamento`](#cancelamento)

###### Implementation of

[`EventBus`](#eventbus).[`assinar`](#assinar-1)

##### publicar()

> **publicar**(`evento`): `void`

###### Parameters

###### evento

[`EventoDominio`](#eventodominio)

###### Returns

`void`

###### Implementation of

[`EventBus`](#eventbus).[`publicar`](#publicar-2)

## Interfaces

### AutenticacaoPort

Autenticação de usuários.

- **Provê:** `@g6/identidade` (Chain of Responsibility da E03).
- **Consome:** `apps/*`.
- **Garante:** uma `Sessao` só existe depois de a cadeia inteira aprovar o login;
  credencial errada, conta bloqueada e segundo fator ausente voltam como erro,
  nunca como exceção.

#### Methods

##### login()

> **login**(`credenciais`): `Promise`\<[`Resultado`](#resultado)\<[`Sessao`](#sessao)\>\>

Autentica e emite a sessão.

###### Parameters

###### credenciais

[`Credenciais`](#credenciais)

###### Returns

`Promise`\<[`Resultado`](#resultado)\<[`Sessao`](#sessao)\>\>

##### stepUp()

> **stepUp**(`sessao`, `fator`): `Promise`\<[`Resultado`](#resultado)\<[`Sessao`](#sessao)\>\>

Reautentica antes de uma ação sensível e devolve a sessão elevada.
A sessão original não é alterada.

###### Parameters

###### sessao

[`Sessao`](#sessao)

###### fator

[`FatorAdicional`](#fatoradicional)

###### Returns

`Promise`\<[`Resultado`](#resultado)\<[`Sessao`](#sessao)\>\>

***

### ChatPort

Chat em tempo real de uma live.

- **Provê:** `@g6/chat` (Observer do `ChatRoom`).
- **Consome:** `@g6/monetizacao` (o Mediator da doação publica a mensagem destacada) e `apps/*`.
- **Garante:** toda mensagem passa pelo `ModeracaoPort` antes da entrega; só a aprovada
  chega aos ouvintes, na ordem de publicação, e gera `MensagemPublicada`.
  Mensagem em quarentena ou bloqueada volta como erro para quem publicou.

#### Methods

##### inscrever()

> **inscrever**(`live`, `ouvinte`): [`Cancelamento`](#cancelamento)

Passa a receber as mensagens entregues na live a partir de agora; não reenvia histórico.

###### Parameters

###### live

[`LiveId`](#liveid)

###### ouvinte

(`mensagem`) => `void`

###### Returns

[`Cancelamento`](#cancelamento)

##### publicar()

> **publicar**(`live`, `mensagem`): `Promise`\<[`Resultado`](#resultado)\<`void`\>\>

###### Parameters

###### live

[`LiveId`](#liveid)

###### mensagem

[`MensagemChat`](#mensagemchat)

###### Returns

`Promise`\<[`Resultado`](#resultado)\<`void`\>\>

##### publicarDestacada()

> **publicarDestacada**(`live`, `mensagem`): `Promise`\<[`Resultado`](#resultado)\<`void`\>\>

###### Parameters

###### live

[`LiveId`](#liveid)

###### mensagem

[`MensagemDestacada`](#mensagemdestacada)

###### Returns

`Promise`\<[`Resultado`](#resultado)\<`void`\>\>

***

### CheckoutPendente

Recarga criada e aguardando o pagamento. Nada foi creditado ainda.

#### Properties

##### instrucoes

> `readonly` **instrucoes**: `string`

Link do checkout (Mercado Pago, Stripe) ou instrução do processador simulado.

##### meio

> `readonly` **meio**: [`MeioPagamento`](#meiopagamento)

Meio efetivamente usado; pode diferir do escolhido se ele estava indisponível (O07).

##### moedaACreditar

> `readonly` **moedaACreditar**: `number`

##### pacote

> `readonly` **pacote**: [`PacoteId`](#pacoteid)

##### recargaId

> `readonly` **recargaId**: `string`

##### valorCobradoCentavos

> `readonly` **valorCobradoCentavos**: `number`

***

### ComprovanteDoacao

Prova de uma doação concluída: o repasse ao criador já aconteceu.

`destaqueEntregue: false` significa que a doação tinha mensagem e o chat falhou
ao exibi-la. A doação continua válida (E03, Ata S2_02, D05); `aviso` explica a falha.

#### Properties

##### aviso?

> `readonly` `optional` **aviso?**: `string`

##### destaqueEntregue

> `readonly` **destaqueEntregue**: `boolean`

##### doacaoId

> `readonly` **doacaoId**: `string`

##### doador

> `readonly` **doador**: [`UsuarioId`](#usuarioid-1)

##### em

> `readonly` **em**: `Date`

##### live

> `readonly` **live**: [`LiveId`](#liveid)

##### valor

> `readonly` **valor**: `number`

***

### Credenciais

Dados do login (E03 SG3: `AuthenticationRequest`).
`codigoTotp` é exigido de quem tem segundo fator ativo (criadores, conflito C03).

#### Properties

##### codigoTotp?

> `readonly` `optional` **codigoTotp?**: `string`

##### email

> `readonly` **email**: `string`

##### senha

> `readonly` **senha**: `string`

***

### DoacaoPort

Doação a uma live, com ou sem mensagem destacada.

- **Provê:** `@g6/monetizacao` (Facade + Mediator).
- **Consome:** `apps/*`.
- **Garante:** a doação é sempre para uma live no ar; o criador que recebe o repasse vem de
  `TransmissaoPort.consultar`. Live inexistente ou encerrada, saldo insuficiente e doação
  à própria live voltam como erro, sem débito.
  Com a doação concluída, publica `DoacaoConfirmada`. **Falha no chat não desfaz a doação**
  (E03, Ata S2_02, D05): o resultado continua `ok`, com `destaqueEntregue: false`.

#### Methods

##### doar()

> **doar**(`sessao`, `live`, `valor`, `mensagem?`): `Promise`\<[`Resultado`](#resultado)\<[`ComprovanteDoacao`](#comprovantedoacao)\>\>

Com `mensagem`, a doação vira mensagem destacada e é entregue pelo `ChatPort`.

###### Parameters

###### sessao

[`Sessao`](#sessao)

###### live

[`LiveId`](#liveid)

###### valor

`number`

###### mensagem?

`string`

###### Returns

`Promise`\<[`Resultado`](#resultado)\<[`ComprovanteDoacao`](#comprovantedoacao)\>\>

***

### ErroDominio

Falha de regra de negócio, devolvida em `Resultado` em vez de lançada.
`codigo` é estável e serve para decisão em código; `mensagem` é para exibição.

#### Extended by

- [`ErroRecarga`](#errorecarga)

#### Properties

##### codigo

> `readonly` **codigo**: `string`

##### mensagem

> `readonly` **mensagem**: `string`

***

### ErroRecarga

Erro de `RecargaPort.recarregar`. Com o código `MEIO_INDISPONIVEL`, `alternativas`
traz os meios que estão respondendo, para o modal oferecer ao espectador (O07).

#### Extends

- [`ErroDominio`](#errodominio)

#### Properties

##### alternativas?

> `readonly` `optional` **alternativas?**: readonly [`MeioPagamento`](#meiopagamento)[]

##### codigo

> `readonly` **codigo**: `string`

###### Inherited from

[`ErroDominio`](#errodominio).[`codigo`](#codigo)

##### mensagem

> `readonly` **mensagem**: `string`

###### Inherited from

[`ErroDominio`](#errodominio).[`mensagem`](#mensagem)

***

### EventBus

Barramento de eventos em memória, compartilhado pelos pacotes.

- **Provê:** `@g6/shared-kernel` (`EventBusEmMemoria`, #4); `apps/*` criam a instância única.
- **Consome:** qualquer pacote, para publicar os próprios eventos e assinar os dos outros.
- **Garante:** entrega síncrona, na ordem de assinatura, só a quem assinou aquele `tipo`.

#### Methods

##### assinar()

> **assinar**\<`T`\>(`tipo`, `tratador`): [`Cancelamento`](#cancelamento)

###### Type Parameters

###### T

`T` *extends* `"LiveIniciada"` \| `"LiveEncerrada"` \| `"RecargaConcluida"` \| `"DoacaoConfirmada"` \| `"MensagemPublicada"`

###### Parameters

###### tipo

`T`

###### tratador

(`evento`) => `void`

###### Returns

[`Cancelamento`](#cancelamento)

##### publicar()

> **publicar**(`evento`): `void`

###### Parameters

###### evento

[`EventoDominio`](#eventodominio)

###### Returns

`void`

***

### FatorAdicional

Fator pedido na reautenticação antes de uma ação sensível
(E03 SG3: cadeia de step-up, concluída com TOTP).

#### Properties

##### codigo

> `readonly` **codigo**: `string`

##### tipo

> `readonly` **tipo**: `"totp"`

***

### LiveResumo

O que os outros módulos precisam saber de uma live no ar.
`canal` é onde ela acontece; `criador` é a conta que a abriu e que recebe as doações.

#### Properties

##### canal

> `readonly` **canal**: [`CanalId`](#canalid)

##### criador

> `readonly` **criador**: [`UsuarioId`](#usuarioid-1)

##### iniciadaEm

> `readonly` **iniciadaEm**: `Date`

##### live

> `readonly` **live**: [`LiveId`](#liveid)

##### titulo

> `readonly` **titulo**: `string`

***

### MensagemChat

Mensagem comum de chat (E03 SG3: `ChatMessage`).

#### Extended by

- [`MensagemDestacada`](#mensagemdestacada)

#### Properties

##### autor

> `readonly` **autor**: [`UsuarioId`](#usuarioid-1)

##### em

> `readonly` **em**: `Date`

##### id

> `readonly` **id**: `string`

##### nomeAutor

> `readonly` **nomeAutor**: `string`

##### texto

> `readonly` **texto**: `string`

***

### MensagemDestacada

Mensagem paga, com os destaques já resolvidos pelo Decorator da monetização
(E03 SG2: `MensagemDestacada`). O chat só exibe; não recalcula faixa.

#### Extends

- [`MensagemChat`](#mensagemchat)

#### Properties

##### autor

> `readonly` **autor**: [`UsuarioId`](#usuarioid-1)

###### Inherited from

[`MensagemChat`](#mensagemchat).[`autor`](#autor)

##### cor

> `readonly` **cor**: `string` \| `null`

Cor da faixa de destaque; `null` quando não há cor.

##### em

> `readonly` **em**: `Date`

###### Inherited from

[`MensagemChat`](#mensagemchat).[`em`](#em-1)

##### id

> `readonly` **id**: `string`

###### Inherited from

[`MensagemChat`](#mensagemchat).[`id`](#id)

##### nomeAutor

> `readonly` **nomeAutor**: `string`

###### Inherited from

[`MensagemChat`](#mensagemchat).[`nomeAutor`](#nomeautor)

##### tempoFixacaoMin

> `readonly` **tempoFixacaoMin**: `number`

Minutos fixada no topo do chat; `0` quando não fixa.

##### texto

> `readonly` **texto**: `string`

###### Inherited from

[`MensagemChat`](#mensagemchat).[`texto`](#texto)

##### valor

> `readonly` **valor**: `number`

Quanto foi doado junto com a mensagem.

***

### ModeracaoPort

Moderação automática de mensagens.

- **Provê:** `@g6/moderacao` (AutoMod + Strategy da E03).
- **Consome:** `@g6/chat`.
- **Garante:** sempre responde com um veredito; não entrega, não guarda e não altera
  a mensagem. O que fazer com cada decisão é responsabilidade do chat.

#### Methods

##### avaliar()

> **avaliar**(`mensagem`): `Promise`\<[`VereditoModeracao`](#vereditomoderacao)\>

Aceita também `MensagemDestacada`, que é uma `MensagemChat`.

###### Parameters

###### mensagem

[`MensagemChat`](#mensagemchat)

###### Returns

`Promise`\<[`VereditoModeracao`](#vereditomoderacao)\>

***

### OfertaRecarga

Oferta de um pacote no modal de recarga, com os preços montados pela cadeia de
Decorator da monetização (E03 SG2: `OfertaPacote`). Valores em centavos de real.

#### Properties

##### composicao

> `readonly` **composicao**: `string`

Camadas aplicadas, ex.: "pacote de 210 (R$ 10,00) → desconto de 8% → imposto de 5%".

##### descontoPercentual?

> `readonly` `optional` **descontoPercentual?**: `number`

##### moeda

> `readonly` **moeda**: `number`

##### pacote

> `readonly` **pacote**: [`PacoteId`](#pacoteid)

##### precoCentavos

> `readonly` **precoCentavos**: `number`

Preço final, com a cadeia completa de decoradores.

##### precoSemDescontoCentavos

> `readonly` **precoSemDescontoCentavos**: `number`

Preço fora da promoção, já com taxa e imposto. É o valor riscado no modal.

***

### PresetTransmissao

Pedido de abertura de live por preset (E03 SG1: receitas do `StreamConfigDirector`).
O título é o único dado livre; o restante da configuração vem do preset.

#### Properties

##### preset

> `readonly` **preset**: `"baixa-latencia"` \| `"alta-qualidade"` \| `"movel"`

##### titulo

> `readonly` **titulo**: `string`

***

### RecargaPort

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

#### Methods

##### consultar()

> **consultar**(`sessao`, `recargaId`): `Promise`\<[`Resultado`](#resultado)\<[`SituacaoRecarga`](#situacaorecarga)\>\>

Situação de uma recarga da própria sessão. Recarga inexistente ou de outro usuário é erro.

###### Parameters

###### sessao

[`Sessao`](#sessao)

###### recargaId

`string`

###### Returns

`Promise`\<[`Resultado`](#resultado)\<[`SituacaoRecarga`](#situacaorecarga)\>\>

##### ofertas()

> **ofertas**(`sessao`): `Promise`\<[`Resultado`](#resultado)\<[`OfertaRecarga`](#ofertarecarga)[]\>\>

Pacotes à venda com preço riscado e promocional, para o modal de recarga.

###### Parameters

###### sessao

[`Sessao`](#sessao)

###### Returns

`Promise`\<[`Resultado`](#resultado)\<[`OfertaRecarga`](#ofertarecarga)[]\>\>

##### recarregar()

> **recarregar**(`sessao`, `pacote`, `meio`): `Promise`\<[`Resultado`](#resultado)\<[`CheckoutPendente`](#checkoutpendente), [`ErroRecarga`](#errorecarga)\>\>

Cria a recarga e o checkout no meio escolhido. Se ele estiver indisponível e sobrar um
único outro, segue nesse (ver `CheckoutPendente.meio`); se sobrarem vários, devolve
`MEIO_INDISPONIVEL` com as alternativas.

###### Parameters

###### sessao

[`Sessao`](#sessao)

###### pacote

[`PacoteId`](#pacoteid)

###### meio

[`MeioPagamento`](#meiopagamento)

###### Returns

`Promise`\<[`Resultado`](#resultado)\<[`CheckoutPendente`](#checkoutpendente), [`ErroRecarga`](#errorecarga)\>\>

***

### Recibo

Prova de uma recarga concluída: a moeda já foi creditada na carteira.

#### Properties

##### em

> `readonly` **em**: `Date`

##### meio

> `readonly` **meio**: [`MeioPagamento`](#meiopagamento)

##### moedaCreditada

> `readonly` **moedaCreditada**: `number`

##### pacote

> `readonly` **pacote**: [`PacoteId`](#pacoteid)

##### recargaId

> `readonly` **recargaId**: `string`

##### valorCobradoCentavos

> `readonly` **valorCobradoCentavos**: `number`

Valor cobrado em centavos de real, já com desconto, taxa e imposto.

***

### Sessao

Sessão autenticada, emitida por `AutenticacaoPort`. É o que os demais ports
recebem para saber quem está agindo; nenhum pacote revalida o token.

#### Properties

##### expiraEm

> `readonly` **expiraEm**: `Date`

##### papel

> `readonly` **papel**: [`Papel`](#papel-1)

##### token

> `readonly` **token**: `string`

##### usuarioId

> `readonly` **usuarioId**: [`UsuarioId`](#usuarioid-1)

***

### TransmissaoPort

Ciclo de vida da live.

- **Provê:** `@g6/transmissao` (Builder + Director na configuração, Observer no canal).
- **Consome:** `apps/*` e `@g6/monetizacao` (a doação consulta quem é o criador da live).
- **Garante:** só sessão com papel `criador` abre live; abrir publica `LiveIniciada`
  e encerrar publica `LiveEncerrada` no `EventBus`, uma vez cada. É a única fonte
  de "esta live é de tal criador": nenhum outro módulo guarda essa relação.

#### Methods

##### abrir()

> **abrir**(`criador`, `preset`): `Promise`\<[`Resultado`](#resultado)\<[`LiveResumo`](#liveresumo)\>\>

Monta a configuração pelo preset e coloca a live no ar.

###### Parameters

###### criador

[`Sessao`](#sessao)

###### preset

[`PresetTransmissao`](#presettransmissao)

###### Returns

`Promise`\<[`Resultado`](#resultado)\<[`LiveResumo`](#liveresumo)\>\>

##### consultar()

> **consultar**(`live`): `Promise`\<[`Resultado`](#resultado)\<[`LiveResumo`](#liveresumo)\>\>

Dados de uma live no ar. Live inexistente ou já encerrada volta como erro.

###### Parameters

###### live

[`LiveId`](#liveid)

###### Returns

`Promise`\<[`Resultado`](#resultado)\<[`LiveResumo`](#liveresumo)\>\>

##### encerrar()

> **encerrar**(`criador`, `live`): `Promise`\<[`Resultado`](#resultado)\<`void`\>\>

Encerra a live. Só o criador que a abriu pode encerrar.

###### Parameters

###### criador

[`Sessao`](#sessao)

###### live

[`LiveId`](#liveid)

###### Returns

`Promise`\<[`Resultado`](#resultado)\<`void`\>\>

***

### VereditoModeracao

Decisão com o motivo, para auditoria e para avisar o autor (E03 SG3: `ModerationVerdict`).

#### Properties

##### decisao

> `readonly` **decisao**: [`DecisaoModeracao`](#decisaomoderacao)

##### motivo

> `readonly` **motivo**: `string`

## Type Aliases

### CanalId

> **CanalId** = `string` & `object`

#### Type Declaration

##### \_\_marca

> `readonly` **\_\_marca**: `"CanalId"`

***

### Cancelamento

> **Cancelamento** = () => `void`

Desfaz uma inscrição (`ChatPort.inscrever`, `EventBus.assinar`). Chamar duas vezes não tem efeito.

#### Returns

`void`

***

### DecisaoModeracao

> **DecisaoModeracao** = `"aprovada"` \| `"quarentena"` \| `"bloqueada"`

Decisão da moderação (E03 SG3: `ModerationDecision`).

***

### EventoDe

> **EventoDe**\<`T`\> = `Extract`\<[`EventoDominio`](#eventodominio), \{ `tipo`: `T`; \}\>

O evento de um tipo específico: `EventoDe<'LiveIniciada'>`.

#### Type Parameters

##### T

`T` *extends* [`TipoEvento`](#tipoevento)

***

### EventoDominio

> **EventoDominio** = \{ `canal`: [`CanalId`](#canalid); `em`: `Date`; `live`: [`LiveId`](#liveid); `tipo`: `"LiveIniciada"`; \} \| \{ `canal`: [`CanalId`](#canalid); `em`: `Date`; `live`: [`LiveId`](#liveid); `tipo`: `"LiveEncerrada"`; \} \| \{ `em`: `Date`; `moeda`: [`MoedaVirtual`](#moedavirtual); `recargaId`: `string`; `tipo`: `"RecargaConcluida"`; `usuario`: [`UsuarioId`](#usuarioid-1); \} \| \{ `doador`: [`UsuarioId`](#usuarioid-1); `em`: `Date`; `live`: [`LiveId`](#liveid); `tipo`: `"DoacaoConfirmada"`; `valor`: [`MoedaVirtual`](#moedavirtual); \} \| \{ `autor`: [`UsuarioId`](#usuarioid-1); `destacada`: `boolean`; `em`: `Date`; `live`: [`LiveId`](#liveid); `tipo`: `"MensagemPublicada"`; \}

Fatos já acontecidos que um pacote anuncia aos outros sem conhecê-los.
`tipo` discrimina a união; `em` é o instante do fato, não o da entrega.

#### Union Members

##### Type Literal

\{ `canal`: [`CanalId`](#canalid); `em`: `Date`; `live`: [`LiveId`](#liveid); `tipo`: `"LiveIniciada"`; \}

Publicado por `@g6/transmissao` ao abrir a live.

***

##### Type Literal

\{ `canal`: [`CanalId`](#canalid); `em`: `Date`; `live`: [`LiveId`](#liveid); `tipo`: `"LiveEncerrada"`; \}

Publicado por `@g6/transmissao` ao encerrar; `@g6/conteudo` reage criando o VOD.

***

##### Type Literal

\{ `em`: `Date`; `moeda`: [`MoedaVirtual`](#moedavirtual); `recargaId`: `string`; `tipo`: `"RecargaConcluida"`; `usuario`: [`UsuarioId`](#usuarioid-1); \}

Publicado por `@g6/monetizacao` depois de creditar a moeda de uma recarga paga.

***

##### Type Literal

\{ `doador`: [`UsuarioId`](#usuarioid-1); `em`: `Date`; `live`: [`LiveId`](#liveid); `tipo`: `"DoacaoConfirmada"`; `valor`: [`MoedaVirtual`](#moedavirtual); \}

Publicado por `@g6/monetizacao` depois do repasse, mesmo que o chat falhe (D05).

***

##### Type Literal

\{ `autor`: [`UsuarioId`](#usuarioid-1); `destacada`: `boolean`; `em`: `Date`; `live`: [`LiveId`](#liveid); `tipo`: `"MensagemPublicada"`; \}

Publicado por `@g6/chat` para cada mensagem aprovada e entregue.

***

### LiveId

> **LiveId** = `string` & `object`

#### Type Declaration

##### \_\_marca

> `readonly` **\_\_marca**: `"LiveId"`

***

### MeioPagamento

> **MeioPagamento** = `"simulado"` \| `"mercadopago"` \| `"stripe"`

Processador escolhido para pagar a recarga (E03 SG2: adaptadores de `GatewayPagamento`).

***

### MensagemEntregue

> **MensagemEntregue** = \{ `destacada`: `false`; `live`: [`LiveId`](#liveid); `mensagem`: [`MensagemChat`](#mensagemchat); \} \| \{ `destacada`: `true`; `live`: [`LiveId`](#liveid); `mensagem`: [`MensagemDestacada`](#mensagemdestacada); \}

O que cada ouvinte de `ChatPort.inscrever` recebe: só mensagens aprovadas pela moderação.

***

### MoedaVirtual

> **MoedaVirtual** = `number`

Quantidade de moeda virtual da plataforma.
Sempre inteiro positivo ou zero, em unidades da moeda (nunca em reais).

***

### PacoteId

> **PacoteId** = `string` & `object`

Pacote do catálogo de recarga (E03 SG2: `Pacote.id`, ex.: `"p10"`).

#### Type Declaration

##### \_\_marca

> `readonly` **\_\_marca**: `"PacoteId"`

***

### Papel

> **Papel** = `"espectador"` \| `"criador"` \| `"moderador"`

Papel do usuário na plataforma. O criador é quem pode abrir live.

***

### Resultado

> **Resultado**\<`T`, `E`\> = \{ `ok`: `true`; `valor`: `T`; \} \| \{ `erro`: `E`; `ok`: `false`; \}

Retorno dos ports: sucesso com valor ou falha com erro, sem exceção cruzando
a fronteira entre pacotes. Exceção fica reservada a defeito de programação.

#### Type Parameters

##### T

`T`

##### E

`E` = [`ErroDominio`](#errodominio)

***

### SituacaoRecarga

> **SituacaoRecarga** = \{ `checkout`: [`CheckoutPendente`](#checkoutpendente); `situacao`: `"pendente"`; \} \| \{ `recibo`: [`Recibo`](#recibo); `situacao`: `"concluida"`; \} \| \{ `motivo`: `string`; `recargaId`: `string`; `situacao`: `"cancelada"`; \}

Em que ponto a recarga está. Só `concluida` significa moeda creditada.

#### Union Members

##### Type Literal

\{ `checkout`: [`CheckoutPendente`](#checkoutpendente); `situacao`: `"pendente"`; \}

***

##### Type Literal

\{ `recibo`: [`Recibo`](#recibo); `situacao`: `"concluida"`; \}

***

##### Type Literal

\{ `motivo`: `string`; `recargaId`: `string`; `situacao`: `"cancelada"`; \}

Não ocorre no fluxo atual: falhas ao criar o checkout voltam como erro em `recarregar`,
e recusa ou expiração mantêm `pendente`. Reservada para um checkout expirado,
se a monetização passar a cancelá-lo.

***

### TipoEvento

> **TipoEvento** = [`EventoDominio`](#eventodominio)\[`"tipo"`\]

Nomes dos eventos, para tipar `EventBus.assinar`.

***

### UsuarioId

> **UsuarioId** = `string` & `object`

Identificadores com marca de tipo.

Em tempo de execução são `string` comuns. A marca existe só para o compilador:
impede passar um `CanalId` onde se espera um `UsuarioId`.

#### Type Declaration

##### \_\_marca

> `readonly` **\_\_marca**: `"UsuarioId"`

## Functions

### canalId()

> **canalId**(`valor`): [`CanalId`](#canalid)

#### Parameters

##### valor

`string`

#### Returns

[`CanalId`](#canalid)

***

### liveId()

> **liveId**(`valor`): [`LiveId`](#liveid)

#### Parameters

##### valor

`string`

#### Returns

[`LiveId`](#liveid)

***

### pacoteId()

> **pacoteId**(`valor`): [`PacoteId`](#pacoteid)

#### Parameters

##### valor

`string`

#### Returns

[`PacoteId`](#pacoteid)

***

### usuarioId()

> **usuarioId**(`valor`): [`UsuarioId`](#usuarioid-1)

#### Parameters

##### valor

`string`

#### Returns

[`UsuarioId`](#usuarioid-1)
