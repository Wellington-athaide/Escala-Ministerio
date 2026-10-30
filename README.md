# Escala da Mídia

Gera a escala da equipe de mídia por culto ou por mês, sem conflito com as escalas dos outros ministérios.

Você cola as escalas dos outros ministérios (ex.: copiadas do WhatsApp). O gerador lê os nomes e horários de cada bloco e não escala quem já está em outro compromisso naquele horário.

Sem dependências externas. Requer Node.js 22 ou superior.

## Como rodar

```bash
npm start          # http://localhost:3000
npm test
npm run build:artifact   # gera dist/escalas-da-igreja.html, que roda sem servidor
```

Variáveis: `PORT` (padrão 3000) e `DATA_FILE` (padrão `data/store.json`).

## Membros e funções

Cada pessoa tem uma lista de funções (ex.: Câmera, Reels, Projeção). O gerador só escala quem faz a função. "tudo" vale para qualquer função, e a pessoa entra como reserva.

Cada função recebe uma pessoa. Uma pessoa pode aparecer em cultos diferentes do mês, mas não em dois cultos que se sobreponham ou fiquem a menos de 60 min um do outro.

## Escalas coladas

Pode colar uma ou várias escalas. Cada data começa um bloco, que vai até a próxima data.

```
Louvor · Domingo, 01/11
Renata
Arthur

Recepção · Quinta, 05/11
Paulo
```

- Nome completo, apelido ou primeiro nome (quando é único no cadastro) são reconhecidos.
- Horário é opcional. Bloco sem horário vale o dia inteiro.
- Se o bloco tiver horário, ele vale só nesse horário. Sem término, considera 2 horas e avisa.

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET/POST | `/api/people` | listar (`?q=`) / cadastrar pessoas |
| PUT/DELETE | `/api/people/:id` | editar / remover |
| POST | `/api/generate` | culto específico (`title`, `date`, `start`, `end`, `roles`, `externalText`) |
| POST | `/api/generate-month` | mês inteiro (`month`, `templates`, `externalText`) |

As duas rotas de geração não salvam nada: devolvem o texto para o WhatsApp e o relatório.
