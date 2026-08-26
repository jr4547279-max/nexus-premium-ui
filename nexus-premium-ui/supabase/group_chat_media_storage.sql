-- Nexus group-chat media storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-chat-media', 'group-chat-media', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "group members can upload chat media" on storage.objects;
create policy "group members can upload chat media"
on storage.objects for insert to authenticated
with check (bucket_id = 'group-chat-media' and exists (select 1 from public.group_members gm where gm.group_id::text = (storage.foldername(name))[1] and gm.user_id = auth.uid()));

drop policy if exists "group members can view chat media" on storage.objects;
create policy "group members can view chat media"
on storage.objects for select to authenticated
using (bucket_id = 'group-chat-media' and exists (select 1 from public.group_members gm where gm.group_id::text = (storage.foldername(name))[1] and gm.user_id = auth.uid()));

drop policy if exists "users can delete own chat media" on storage.objects;
create policy "users can delete own chat media"
on storage.objects for delete to authenticated
using (bucket_id = 'group-chat-media' and owner_id = auth.uid()::text);
