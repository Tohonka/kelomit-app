package com.kelomitapp.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.kelomitapp.R
import org.json.JSONArray

/** Rows of the food widget's list: one per my-foods template, in the order JS ranked them. */
class FoodWidgetListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext)

  private class Factory(private val context: Context) : RemoteViewsFactory {
    private var foods = JSONArray()

    override fun onCreate() {}
    override fun onDestroy() {}
    override fun onDataSetChanged() { foods = FoodWidgetStore.foods(context) }
    override fun getCount(): Int = foods.length()
    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = false

    override fun getViewAt(position: Int): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_food_item)
      val food = foods.optJSONObject(position) ?: return views
      views.setTextViewText(R.id.widget_food_item_name, food.optString("name"))
      // optString would print the literal "null" for a JSON null.
      views.setTextViewText(
        R.id.widget_food_item_kcal,
        if (food.isNull("kcal")) "" else food.optInt("kcal").toString(),
      )
      views.setOnClickFillInIntent(
        R.id.widget_food_item,
        Intent().putExtra(EXTRA_FOOD_INDEX, position),
      )
      return views
    }
  }
}
