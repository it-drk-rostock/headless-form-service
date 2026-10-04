# Public clients reach the backend only through edge functions

The embed does not read Postgres via PostgREST with the anon key. It loads a form through a `/load-form` edge function and submits through `/submit-form`; the anon role has no table access at all. This keeps protected forms' questions hidden until a valid form pass is shown, lets us count form loads for conversion metrics, and gives a single controlled public surface instead of RLS policies on public tables.
