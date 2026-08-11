-- NotifyFunction
create or replace function crm.notify_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  scope text;
  row_id text;
begin
  scope := coalesce(
    to_jsonb(new) ->> 'projectId',
    to_jsonb(old) ->> 'projectId'
  );

  if scope is null then
    return null;
  end if;

  row_id := coalesce(
    to_jsonb(new) ->> 'id',
    to_jsonb(old) ->> 'id'
  );

  perform pg_notify(
    'crm_changes',
    json_build_object(
      'projectId', scope,
      'table', tg_table_name,
      'op', lower(tg_op),
      'id', row_id
    )::text
  );

  return null;
end;
$$;

-- NotifyTriggers
create trigger company_notify
  after insert or update or delete on crm."company"
  for each row execute function crm.notify_row_change();

create trigger contact_notify
  after insert or update or delete on crm."contact"
  for each row execute function crm.notify_row_change();

create trigger deal_notify
  after insert or update or delete on crm."deal"
  for each row execute function crm.notify_row_change();

create trigger activity_notify
  after insert or update or delete on crm."activity"
  for each row execute function crm.notify_row_change();

create trigger agent_task_notify
  after insert or update or delete on crm."agentTask"
  for each row execute function crm.notify_row_change();

create trigger agent_event_notify
  after insert or update or delete on crm."agentEvent"
  for each row execute function crm.notify_row_change();
