package com.kelomitapp.location

data class PlaceDistance(
  val place: NativePlace,
  val distanceM: Float,
)

data class Crossing(
  val place: NativePlace,
  val direction: String,
)

data class MembershipResult(
  val insideIds: Set<Long>,
  val crossings: List<Crossing>,
)

object PlaceMembership {
  private const val EXIT_HYSTERESIS = 1.25f

  fun reduce(
    distances: List<PlaceDistance>,
    insideIds: Set<Long>,
  ): MembershipResult {
    val knownIds = distances.mapTo(mutableSetOf()) { it.place.id }
    val nextInside = insideIds.intersect(knownIds).toMutableSet()
    val crossings = mutableListOf<Crossing>()

    distances.forEach { sample ->
      val id = sample.place.id
      when {
        id !in nextInside && sample.distanceM <= sample.place.radiusM -> {
          nextInside += id
          crossings += Crossing(sample.place, "enter")
        }
        id in nextInside &&
          sample.distanceM > sample.place.radiusM * EXIT_HYSTERESIS -> {
          nextInside -= id
          crossings += Crossing(sample.place, "exit")
        }
      }
    }

    return MembershipResult(nextInside, crossings)
  }
}
