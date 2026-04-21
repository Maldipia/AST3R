// src/app/admin/print/[id]/page.tsx
import { createServiceClient } from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

export default async function PrintSlip({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { data: order } = await supabase
    .from('orders').select('*, order_items(*), payments(*)').eq('id', params.id).single();
  if (!order) return <div style={{padding:'32px'}}>Order not found</div>;
  return (
    <html>
      <head>
        <title>Packing Slip — {order.order_code}</title>
        <style>{`
          body{font-family:sans-serif;font-size:12px;color:#111;padding:24px;max-width:600px;margin:0 auto}
          .brand{font-size:22px;font-weight:700;letter-spacing:3px}
          .label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#888;margin-bottom:3px}
          table{width:100%;border-collapse:collapse;margin-top:10px}
          th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#888;padding:6px 0;border-bottom:1px solid #ddd}
          td{padding:8px 0;border-bottom:1px solid #f0f0f0}
          @media print{.noprint{display:none}}
        `}</style>
      </head>
      <body>
        <button className="noprint" onClick={() => window.print()}
          style={{marginBottom:'16px',padding:'8px 16px',background:'#111',color:'#fff',border:'none',cursor:'pointer',borderRadius:'4px'}}>
          Print Slip
        </button>
        <div style={{borderBottom:'2px solid #111',paddingBottom:'12px',marginBottom:'16px',display:'flex',justifyContent:'space-between'}}>
          <div>
            <div className="brand">AST3R</div>
            <div style={{fontSize:'10px',color:'#888'}}>SVC Amadeo, Cavite · 0967-4000-040 · inquiry@ast3r.store</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontWeight:'700',fontSize:'14px'}}>{order.order_code}</div>
            <div style={{fontSize:'11px',color:'#555'}}>{formatDate(order.created_at)}</div>
            <div style={{textTransform:'uppercase',fontSize:'11px',color: order.status==='paid'?'#22c55e':'#f59e0b'}}>{order.status}</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
          <div>
            <div className="label">Ship To</div>
            <div style={{fontWeight:'600'}}>{order.customer_name}</div>
            <div>{order.contact_number}</div>
            <div>{order.email}</div>
            <div style={{marginTop:'4px',color:'#555'}}>{order.address_full}</div>
          </div>
          <div>
            <div className="label">Delivery</div>
            <div style={{fontWeight:'600'}}>{order.courier||'TBD'}</div>
            <div>{order.region||'—'}</div>
            {order.tracking_number && <div style={{marginTop:'4px'}}>Tracking: <strong>{order.tracking_number}</strong></div>}
            <div style={{marginTop:'4px',textTransform:'uppercase',fontWeight:'600'}}>{order.payment_method_type||'—'}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>SKU</th><th>Qty</th><th style={{textAlign:'right'}}>Price</th></tr></thead>
          <tbody>
            {(order.order_items||[]).map((item: any, i: number) => (
              <tr key={i}>
                <td><strong>{item.sku}</strong>{item.size ? ` · ${item.size}` : ''}</td>
                <td>×{item.quantity}</td>
                <td style={{textAlign:'right'}}>{formatPrice(item.price * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={2} style={{textAlign:'right'}}>Subtotal</td><td style={{textAlign:'right'}}>{formatPrice(order.subtotal)}</td></tr>
            <tr><td colSpan={2} style={{textAlign:'right'}}>Shipping</td><td style={{textAlign:'right'}}>{formatPrice(order.shipping_fee)}</td></tr>
            {order.discount > 0 && <tr><td colSpan={2} style={{textAlign:'right',color:'#22c55e'}}>Discount</td><td style={{textAlign:'right',color:'#22c55e'}}>-{formatPrice(order.discount)}</td></tr>}
            <tr><td colSpan={2} style={{textAlign:'right',fontWeight:'700',borderTop:'2px solid #111',paddingTop:'8px'}}>TOTAL</td>
              <td style={{textAlign:'right',fontWeight:'700',borderTop:'2px solid #111',paddingTop:'8px'}}>{formatPrice(order.total_amount)}</td></tr>
          </tfoot>
        </table>
        {order.special_req && <div style={{marginTop:'16px',padding:'10px',background:'#fafafa',border:'1px solid #eee'}}>
          <div className="label">Special Instructions</div>
          <div>{order.special_req}</div>
        </div>}
        <div style={{marginTop:'24px',borderTop:'1px solid #ddd',paddingTop:'12px',fontSize:'10px',color:'#888',textAlign:'center'}}>
          AST3R Fashion · @ast3r.ph · Thank you for your purchase!
        </div>
      </body>
    </html>
  );
}
