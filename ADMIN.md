# Painel Black White Festas

## Abrir pelo MAMP

Use PHP 8.3 ou superior com PDO SQLite (já disponível no MAMP deste computador).
Abra o site pelo servidor PHP, não como arquivo ou por um servidor somente estático.
Acesse `admin/` no mesmo endereço do site, ou o link **Área administrativa** no rodapé.
Na primeira visita, pelo próprio computador (`127.0.0.1` ou `localhost`), escolha usuário e senha de pelo menos 12 caracteres. Não existe senha padrão. Depois de criado o primeiro administrador, o cadastro inicial é desativado.

## Operação

- **Nova reserva:** informe cliente, telefone, endereço, período, equipamentos e taxa de entrega.
- **Pendente** e **Confirmada** ocupam os equipamentos. Os pedidos recebidos pelo WhatsApp precisam ser cadastrados no painel; o simples envio da mensagem não cria uma reserva.
- **Confirmar**, **Editar** e **Cancelar** ficam na lista de registros. Cancelar preserva o histórico e libera os equipamentos.
- **Bloquear manutenção:** selecione o equipamento no filtro, clique no dia e registre início/fim e motivo. É possível bloquear vários equipamentos no mesmo registro.
- O calendário administrativo mostra os registros do equipamento filtrado. Clique num dia e depois num registro para editar.
- Sobreposição é conferida no servidor, dentro de uma transação SQLite, inclusive ao confirmar ou reativar uma reserva. O intervalo para desmontagem e transporte é de 120 minutos por padrão e pode ser alterado no painel. Com essa margem, uma retirada às 12h libera o brinquedo às 14h. A margem não é acrescentada ao fim de uma manutenção.
- Alterar a margem também verifica os registros ativos: o painel rejeita a mudança se ela provocar conflitos.
- Ao preencher os horários no formulário administrativo, o horário previsto de liberação aparece antes de salvar. A gravação sempre verifica novamente os conflitos no servidor, inclusive na confirmação e na reativação de um registro cancelado.
- Preços usam a mesma tabela atual do site. A taxa de entrega é informada no painel. Manutenção tem total zero.

## Solicitação pelo WhatsApp

O botão **Solicitar reserva pelo WhatsApp** abre uma mensagem com nome, telefone, brinquedos selecionados, região, endereço, datas e horários de instalação e retirada, subtotal, entrega e total estimado. O cliente precisa enviar a mensagem no WhatsApp. O formulário e a mensagem informam que a reserva depende da aprovação da Black White Festas.

A abertura do WhatsApp não cria nem confirma registros no banco. A empresa analisa o pedido, cadastra a reserva no painel como **Pendente** e, após aprovar, usa **Confirmar**. A confirmação verifica os conflitos no servidor e atualiza a disponibilidade compartilhada. A resposta ao cliente é feita pela empresa no WhatsApp.

## Calendário público

`api/availability.php?month=AAAA-MM` fornece somente a situação de cada equipamento, sem nomes, telefones ou endereços. O site e o painel administrativo atualizam a consulta a cada 30 segundos enquanto estão visíveis, ao voltar para a aba e ao recuperar a conexão. Após salvar no painel, a agenda desse painel é atualizada imediatamente; nos demais dispositivos, a alteração aparece na próxima consulta (até 30 segundos com conexão ativa). A atualização automática preserva os formulários em edição.

Sem horários informados, a disponibilidade pública é por **dia inteiro**: qualquer reserva, manutenção ou intervalo de transporte naquele dia marca o equipamento indisponível. Ao informar instalação e retirada, o site consulta o período exato e inclui a margem de transporte. O calendário administrativo mostra os dias ocupados e, nos detalhes de cada registro, o horário de liberação.

Antes do primeiro administrador ser criado, a API retorna disponibilidade desconhecida.

## Persistência e publicação

Todos os dispositivos devem acessar o mesmo endereço do servidor PHP: celular, tablet e computador consultam a mesma base. Na rede local, use o IP do computador que executa o MAMP e a porta configurada; para acesso pela internet, publique a aplicação em um servidor PHP com armazenamento persistente. Cópias do projeto executadas em servidores separados terão bancos independentes.

O banco fica em `.private/reservas.sqlite`, excluído do Git. Não apague esse arquivo: ele contém usuários e reservas. Faça cópias de segurança regulares do banco com o servidor parado ou usando a ferramenta de backup do SQLite.

No Apache/MAMP, mantenha os arquivos `.htaccess` ativos (`AllowOverride` habilitado): eles bloqueiam acesso ao banco, arquivos ocultos e chaves locais existentes. Em produção, use HTTPS e configure `BW_DATA_DIR` para um diretório persistente **fora da pasta pública**, com permissão de escrita para o PHP. Não sirva este projeto em um servidor estático. Não publique chaves privadas, banco ou arquivos de teste.

O login usa hash de senha, cookies HttpOnly/SameSite, renovação do identificador da sessão, expiração após 2 horas de inatividade, token CSRF e limite de 5 tentativas de login por IP em 15 minutos. Os dados são inseridos no HTML com `textContent` e no banco com consultas parametrizadas.

## Desenvolvimento e testes

Servidor local alternativo:

```sh
/Applications/MAMP/bin/php/php8.3.30/bin/php -S 127.0.0.1:8080 router.php
```

Para testar a API, use um banco temporário novo, nunca a base real:

```sh
BW_DATA_DIR="$(mktemp -d /tmp/bw-test.XXXXXX)" /Applications/MAMP/bin/php/php8.3.30/bin/php -S 127.0.0.1:8088 router.php
# Em outro terminal:
python3 tests/admin_api_test.py
node --test tests/*.test.cjs
```

O teste cria credenciais aleatórias somente no banco temporário e cobre autenticação, CSRF, cadastro, alteração, confirmação, cancelamento, conflito de horário, manutenção individual e leitura pública sem dados pessoais.
