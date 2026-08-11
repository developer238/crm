-- DropBroadcastTriggers
drop trigger if exists company_broadcast on crm."company";
drop trigger if exists contact_broadcast on crm."contact";
drop trigger if exists deal_broadcast on crm."deal";
drop trigger if exists activity_broadcast on crm."activity";
drop trigger if exists agent_task_broadcast on crm."agentTask";
drop trigger if exists agent_event_broadcast on crm."agentEvent";

drop function if exists crm.broadcast_row_change();

-- DropChannelAuthorization
drop policy if exists "crm project members read own topics" on realtime.messages;
drop policy if exists "crm project members write own topics" on realtime.messages;

-- DropRole
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'crm_realtime') then
    revoke all on realtime.messages from crm_realtime;
    revoke usage on schema realtime from crm_realtime;
    revoke crm_realtime from authenticator;
    drop role crm_realtime;
  end if;
end $$;
