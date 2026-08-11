-- CreateRole
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'crm_realtime') then
    create role crm_realtime nologin;
  end if;
end $$;

grant crm_realtime to authenticator;

grant usage on schema realtime to crm_realtime;
grant select, insert on realtime.messages to crm_realtime;

-- BroadcastFunction
create or replace function crm.broadcast_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  scope text;
begin
  scope := coalesce(new."projectId", old."projectId");

  if scope is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'project:' || scope || ':' || tg_table_name,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );

  return null;
end;
$$;

-- BroadcastTriggers
create trigger company_broadcast
  after insert or update or delete on crm."company"
  for each row execute function crm.broadcast_row_change();

create trigger contact_broadcast
  after insert or update or delete on crm."contact"
  for each row execute function crm.broadcast_row_change();

create trigger deal_broadcast
  after insert or update or delete on crm."deal"
  for each row execute function crm.broadcast_row_change();

create trigger activity_broadcast
  after insert or update or delete on crm."activity"
  for each row execute function crm.broadcast_row_change();

create trigger agent_task_broadcast
  after insert or update or delete on crm."agentTask"
  for each row execute function crm.broadcast_row_change();

create trigger agent_event_broadcast
  after insert or update or delete on crm."agentEvent"
  for each row execute function crm.broadcast_row_change();

-- ChannelAuthorization
create policy "crm project members read own topics"
  on realtime.messages
  for select
  to crm_realtime
  using (
    realtime.topic() like 'project:' || (auth.jwt() ->> 'project_id') || ':%'
  );

create policy "crm project members write own topics"
  on realtime.messages
  for insert
  to crm_realtime
  with check (
    realtime.topic() like 'project:' || (auth.jwt() ->> 'project_id') || ':%'
  );
