BEGIN;

CREATE POLICY tickets_dev_anon_update
ON public.tickets
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY tickets_dev_anon_select
ON public.tickets
FOR SELECT
TO anon
USING (true);

CREATE POLICY clientes_dev_anon_select
ON public.clientes
FOR SELECT
TO anon
USING (true);

CREATE POLICY qr_dev_anon_insert
ON public.ticket_respuestas_rapidas
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY qr_dev_anon_update
ON public.ticket_respuestas_rapidas
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

COMMIT;
