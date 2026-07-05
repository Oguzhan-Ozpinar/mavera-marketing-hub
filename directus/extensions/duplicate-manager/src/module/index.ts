import { defineModule } from "@directus/extensions-sdk";
import ModuleComponent from "./Module.vue";

export default defineModule({
  id: "duplicate-manager",
  name: "Dublon Kontrol",
  icon: "join_inner",
  color: "#2563eb",
  routes: [
    {
      path: "",
      component: ModuleComponent,
    },
  ],
});
