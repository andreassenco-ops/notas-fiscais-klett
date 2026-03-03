-- Add new columns for SQL query functionality
ALTER TABLE public.templates
ADD COLUMN sql_query text,
ADD COLUMN query_interval_minutes integer NOT NULL DEFAULT 60,
ADD COLUMN last_query_at timestamp with time zone;

-- Update all 15 templates with the new message bodies
UPDATE public.templates SET name = 'Feliz Aniversário', body = 'Olá [[NOME]] parabéns pelos seus [[IDADE]] de vida. Nós da equipe desejamos a você o melhor dos dias. Grande abraço' WHERE id = 1;
UPDATE public.templates SET name = 'Orçamento Realizado', body = 'Olá [[NOME]], Seu orçamento foi finalizado e é válido até o dia [[DATA_VENCIMENTO]]. [[EXAMES]] Sendo o valor total [[TOTALORC]]. Agradeçemos a preferência.' WHERE id = 2;
UPDATE public.templates SET name = 'Inclusão Solicitação Coleta', body = '[[NOME]] recebemos sua solicitação de protocolo [[PROTOCOLO]] para os seguintes exames: [[EXAMES]] O resultado dos mesmos deve estar disponível até o dia [[DATAENTREGA]] ás [[HORAENTREGA]]. Agradeçemos a preferência.' WHERE id = 3;
UPDATE public.templates SET name = 'Agendamento Realizado', body = '[[NOME]] seu agendamento de protocolo [[PROTOCOLO]] para a [[DATA]] [[HORA]] está confirmado. Agradeçemos a preferência.' WHERE id = 4;
UPDATE public.templates SET name = 'Lembrete de Agendamento', body = '[[NOME]] passando para lembrar que dia [[DATA]] às [[HORA]] você possui um agendamento de protocolo [[PROTOCOLO]]. Dirija-se ao endereço [[ENDERECO]] - [[CIDADE]] que estaremos pronto a lhe atender. Agradeçemos a preferência.' WHERE id = 5;
UPDATE public.templates SET name = 'Alerta Data Último Exame', body = '[[NOME]] seu último exame conosco foi dia [[DATA]] e caso queria fazer um novo check-up estamos com uma promoção especial.' WHERE id = 6;
UPDATE public.templates SET name = 'Resultados Disponíveis', body = 'Olá [[NOME]] os resultados dos seus exames do protocolo [[PROTOCOLO]] já estão disponíveis em www.sitedisponivel.com.br. Agradeçemos a preferência.' WHERE id = 7;
UPDATE public.templates SET name = 'Orçamento Não Convertido', body = 'Olá [[NOME]], verificamos que não aprovou nosso orçamento de protocolo [[PROTOCOLO]] do dia [[DATA_EMISSAO]] para o [[LOCAL]]. Caso ainda não tenha realizado os exames entre em contato conosco.' WHERE id = 8;
UPDATE public.templates SET name = 'Feliz Natal', body = 'Olá [[NOME]], desejamos a você e toda a sua família um feliz natal.' WHERE id = 9;
UPDATE public.templates SET name = 'Feliz Ano Novo', body = 'Olá [[NOME]], desejamos a você e toda a sua família muita paz, alegria e grandes conquistas nesse ano novo.' WHERE id = 10;
UPDATE public.templates SET name = 'Pacientes Femininos', body = 'Olá [[NOME]], atenção ao outubro rosa.' WHERE id = 11;
UPDATE public.templates SET name = 'Pacientes Masculinos', body = 'Olá [[NOME]], atenção ao novembro azul.' WHERE id = 12;
UPDATE public.templates SET name = 'Inclusão Solicitação Coleta - Com Link Laudo', body = '[[NOME]] recebemos sua solicitação de protocolo [[PROTOCOLO]] para os seguintes exames: [[EXAMES]] O resultado dos mesmos deve estar disponível até o dia [[DATAENTREGA]] ás [[HORAENTREGA]]. Para visualizar seu laudo, clique no link a seguir e digite os 4 primeiros dígitos do seu CPF: [[URL]] ou acesse https://laudos.autolac.com.br/#/login, digite o código: [[CODIGO]] e [[SENHA]] Agradecemos a preferência.' WHERE id = 13;
UPDATE public.templates SET name = 'Pesquisa Satisfação', body = '[[NOME]] os resultados dos seus exames do protocolo [[PROTOCOLO]] já estão disponíveis. Para visualizar seu laudo, clique no link a seguir e digite os 4 primeiros dígitos do seu CPF: [[URL]] ou acesse https://laudos.autolac.com.br/#/login, digite o código: [[CODIGO]] e [[SENHA]] Agradecemos a preferência.' WHERE id = 14;
UPDATE public.templates SET name = 'Modelo 15', body = 'Olá [[NOME]], obrigado por escolher nossos serviços.' WHERE id = 15;