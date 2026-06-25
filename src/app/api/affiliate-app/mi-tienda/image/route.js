import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveCustomerId, unauthorized } from '@/lib/customerAppAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    const customerIdNum = await resolveCustomerId(req);
    if (!customerIdNum) return unauthorized();

    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .select('shopify_collection_id')
      .eq('shopify_customer_id', customerIdNum)
      .single();

    if (error || !affiliate?.shopify_collection_id) {
      return NextResponse.json({ ok: false, error: 'Colección no encontrada' }, { status: 404 });
    }

    const collectionId = affiliate.shopify_collection_id;
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No se proporcionó archivo' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');

    // Método primario: staged upload
    try {
      const stagedRes = await fetch(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2024-07/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
              stagedUploadsCreate(input: $input) {
                stagedTargets { url resourceUrl parameters { name value } }
                userErrors { field message }
              }
            }`,
            variables: {
              input: [{ resource: 'FILE', filename: file.name, mimeType: file.type, fileSize: file.size.toString() }],
            },
          }),
        }
      );

      const stagedData = await stagedRes.json();
      if (stagedData.errors || stagedData.data?.stagedUploadsCreate?.userErrors?.length > 0) {
        throw new Error('Staged upload failed');
      }

      const stagedTarget = stagedData.data.stagedUploadsCreate.stagedTargets[0];
      const baseUrl = stagedTarget.url.split('?')[0];
      const urlParams = new URLSearchParams(stagedTarget.url.split('?')[1]);
      const uploadForm = new FormData();
      for (const [name, value] of urlParams.entries()) uploadForm.append(name, value);
      stagedTarget.parameters.forEach((p) => uploadForm.append(p.name, p.value));
      uploadForm.append('file', new Blob([buffer], { type: file.type }), file.name);

      const uploadRes = await fetch(baseUrl, { method: 'POST', body: uploadForm });
      if (!uploadRes.ok) throw new Error('Upload to staged URL failed');

      const fileCreateRes = await fetch(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2024-07/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `mutation fileCreate($files: [FileCreateInput!]!) {
              fileCreate(files: $files) {
                files { ... on MediaImage { image { url } } }
                userErrors { field message }
              }
            }`,
            variables: {
              files: [{ alt: file.name, contentType: 'IMAGE', originalSource: stagedTarget.resourceUrl }],
            },
          }),
        }
      );

      const fileCreateData = await fileCreateRes.json();
      const imageUrl = fileCreateData.data?.fileCreate?.files?.[0]?.image?.url;
      if (!imageUrl) throw new Error('No image URL from fileCreate');

      const updateRes = await fetch(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2024-07/custom_collections/${collectionId}.json`,
        {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ custom_collection: { id: collectionId, image: { src: imageUrl, alt: file.name } } }),
        }
      );
      if (!updateRes.ok) throw new Error('Collection update failed');

      return NextResponse.json({ ok: true, imageUrl });

    } catch {
      // Fallback: base64 directo
      const updateRes = await fetch(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2024-07/custom_collections/${collectionId}.json`,
        {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            custom_collection: {
              id: collectionId,
              image: { attachment: base64Image, filename: file.name },
            },
          }),
        }
      );
      const updateData = await updateRes.json();
      if (!updateRes.ok) throw new Error(JSON.stringify(updateData));
      return NextResponse.json({ ok: true, imageUrl: updateData.custom_collection?.image?.src });
    }
  } catch (err) {
    console.error('❌ mi-tienda/image POST:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
