export default function HomePageClient() {
  const { customer, loading } = useCustomer(); // Asegúrate de obtener loading también
  
  console.log("🔍 HomePageClient - customer:", customer);
  console.log("🔍 HomePageClient - loading:", loading);
  
  if (loading) {
    return <div className="text-sm text-gray-500">Cargando...</div>;
  }
  
  if (!customer) {
    return <div className="text-sm text-red-500">No hay datos del cliente</div>;
  }
 
  return (
    <div className="flex flex-col text-right text-[#1b3f7a] text-sm">
      <p>{customer.first_name} {customer.last_name}</p>
      <p className="text-xs">{customer.email}</p>
    </div>
  );
}