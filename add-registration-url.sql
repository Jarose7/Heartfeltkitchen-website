-- Add registration_url column to class_events for Stripe checkout links
ALTER TABLE class_events ADD COLUMN registration_url TEXT;

-- Set Stripe checkout URLs for November 2026 classes
UPDATE class_events SET registration_url = 'https://buy.stripe.com/00weVf0DE3tIgmc76qco00x' WHERE title = 'Pie Class' AND event_date = '2026-11-08';
UPDATE class_events SET registration_url = 'https://buy.stripe.com/bJe3cxbiid4i3zq1M6co00z' WHERE title = 'Pasta 102' AND event_date = '2026-11-15';
UPDATE class_events SET registration_url = 'https://buy.stripe.com/aFacN75XY8O2fi83Ueco00y' WHERE title = 'Cupcake Decorating' AND event_date = '2026-11-29';
