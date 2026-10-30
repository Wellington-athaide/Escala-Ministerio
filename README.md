# Escalas da Igreja

Módulo para cadastrar e gerenciar as escalas de todos os ministérios, evitando que uma mesma pessoa seja escalada em compromissos conflitantes por setores diferentes.

Sem dependências externas. Requer Node.js 22 ou superior.

## Como rodar

```bash
npm start          # http://localhost:3000
npm test
```

Variáveis de ambiente: `PORT` (padrão 3000) e `DATA_FILE` (padrão `data/store.json`).

## O que está implementado

| Item | Situação |
| --- | --- |
| 13.1 Cadastro de ministérios | Criar, editar e remover. Vêm pré-cadastrados: Louvor, Intercessão, Recepção, Infantil, Juniores, Jovens e Mídia. Ministério em uso não pode ser removido. |
| 13.2 Escalas externas | Cadastro manual com ministério, evento, data, início, término, pessoas com função, observações e status (confirmada ou provisória). |
| 13.3 Conflitos | Detecta mesmo horário, sobreposição parcial, intervalo insuficiente entre compromissos consecutivos (padrão 60 min, configurável) e indisponibilidades. Cada conflito indica severidade, ministérios envolvidos e tipo. |
| 13.4 Gerador | Consulta as escalas de todos os ministérios antes de montar a equipe. Quem tem conflito bloqueante com escala confirmada ou indisponibilidade é excluído antes de receber função. Conflito com escala provisória gera aviso e a pessoa vai para o fim da fila. |
| 13.5 Importação | CSV (separador `,` ou `;`), com etapa de conferência. Nomes são associados a cadastros existentes por nome exato ou apelido. Nomes parecidos viram sugestões. A importação é atômica. |
| 13.6 Calendário | Lista por dia com filtros por período, ministério, pessoa e tipo. Cada ministério tem uma cor. |
| 13.7 Relatório de conflitos | Lista com pessoa, primeiro e segundo compromisso, ministérios, data e horários e tipo. Permite abrir qualquer um dos dois compromissos para trocar participantes. |
| 13.8 Regras | Cadastro único de pessoas. Remover uma escala não apaga escalas de outros ministérios. Escalas confirmadas e provisórias são distinguidas. O sistema nunca altera escalas de outro ministério sozinho. |

### Ainda não implementado

- **Importação de Excel (.xlsx)** e **de PDF**. Só CSV foi implementado.
- Conflitos inevitáveis não geram uma tela de decisão própria. O coordenador os resolve pelo relatório, trocando participantes.

## Estrutura

```
src/
  time.js          validação de datas/horários e intervalos (atravessa a meia-noite)
  conflicts.js     detecção de conflitos entre compromissos
  scheduling.js    disponibilidade e montagem da equipe da mídia
  csv-import.js    leitura do CSV, agrupamento e associação de nomes
  service.js       regras de negócio e validações (sobre um objeto `db`)
  store.js         persistência em arquivo JSON
  server.js        API HTTP
  main.js          ponto de entrada
public/index.html  interface (página única)
test/              testes com node:test
```

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET/POST | `/api/ministries` | listar / criar ministérios |
| PUT/DELETE | `/api/ministries/:id` | editar / remover |
| GET/POST | `/api/people` | listar (`?q=`) / cadastrar pessoas |
| PUT/DELETE | `/api/people/:id` | editar / remover |
| GET/POST | `/api/commitments` | listar (`from`, `to`, `ministryId`, `personId`, `kind`, `source`) / criar |
| PUT/DELETE | `/api/commitments/:id` | editar / remover |
| GET | `/api/conflicts` | conflitos (`from`, `to`, `minGap`) |
| POST | `/api/generate` | sugere equipe da mídia (não salva) |
| POST | `/api/import/preview` | analisa o CSV (`{ "text": "..." }`) |
| POST | `/api/import/commit` | salva a importação conferida |

## Formato do CSV

Uma linha por pessoa. Colunas obrigatórias: `Ministério; Evento; Data; Início; Fim; Pessoa`. Opcionais: `Função; Status; Observações`.

```
Ministério;Evento;Data;Início;Fim;Pessoa;Função;Status
Recepção;Culto de Domingo;01/11/2026;18h;20h;Renata Silva;Porta;
Mídia;Culto de Domingo;01/11/2026;18:00;20:00;João Lima;Câmera;provisória
```

Datas aceitas: `AAAA-MM-DD` ou `DD/MM/AAAA`. Horários aceitos: `18:30`, `18h30`, `18h`.

## Decisões de modelagem

- Um horário de término anterior ao início, sem data de término, significa que o compromisso atravessa a meia-noite.
- Conflito entre duas escalas confirmadas é **bloqueante**. Se uma delas for provisória, o conflito é **atenção**.
- Gerador: escalas geradas são salvas como **provisórias** por padrão, para que o coordenador confirme.
- Cadastro manual aceita escala conflitante e a registra no relatório. O sistema não bloqueia o cadastro.
